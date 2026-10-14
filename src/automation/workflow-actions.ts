import type { OrakelSettings } from 'src/catalog/settings';
import { normalizeDomain } from 'src/enrichment/enrich-company';
import { type CompanyStatus, companyStatus, OFF_MESSAGE, readCard } from 'src/automation/company-card';
import { orakelFailureMessage } from 'src/widget/card-actions';
import type { OrakelCompanyCard, OrakelMatchCandidate } from 'src/widget/card-types';
import { matchCompany } from 'src/widget/load-card';
import type { OrakelFetch } from 'src/widget/orakel-client';
import { addPerson, type AddPersonDeps, listedPeople, normalizeName } from 'src/widget/people';
import type { TwentyCompany } from 'src/widget/twenty-company';

// Orakel as steps in a Twenty workflow (spec §7 #3). Each acts on one company, read as the
// workflow's executing user, and reuses the widget's code: the card and match calls, "+ Add".
// Only `orakel-enrich-company` and `orakel-add-key-people` write, and only from an automation a
// person built. Website contact scraping is deliberately not a workflow action.
//
// A failure Orakel or Twenty reports comes back as `ok: false` with a message, so a workflow can
// branch on it. The logic functions throw (failing the step) only on a missing or unreadable company.

// orakel-company-health

export type CompanyHealthResult =
  | {
      ok: true;
      orgNumber: string;
      companyName: string;
      status: CompanyStatus;
      isBankrupt: boolean;
      isBeingDissolved: boolean;
      // The newest year with accounts; null fields when Orakel has none.
      latestYear: number | null;
      revenue: number | null;
      operatingResult: number | null;
      netResult: number | null;
    }
  | { ok: false; message: string };

export const companyHealth = async (
  company: TwentyCompany,
  settings: OrakelSettings,
  fetchImpl?: OrakelFetch,
): Promise<CompanyHealthResult> => {
  const read = await readCard(company, settings, fetchImpl);
  if (!read.ok) {
    return read;
  }
  const { overview, financials } = read.card;
  // Newest year first (`buildCompanyCard`).
  const latest = Array.isArray(financials) && financials.length > 0 ? financials[0] : null;

  return {
    ok: true,
    orgNumber: overview.orgNumber,
    companyName: overview.companyName,
    status: companyStatus(overview),
    isBankrupt: overview.isBankrupt === true,
    isBeingDissolved: overview.isBeingDissolved === true,
    latestYear: latest?.year ?? null,
    revenue: latest?.revenue ?? null,
    operatingResult: latest?.operatingResult ?? null,
    netResult: latest?.netResult ?? null,
  };
};

// orakel-find-match

export type FindMatchResult =
  | {
      ok: true;
      // A best candidate, or the org number the company already has.
      found: boolean;
      alreadySet: boolean;
      orgNumber: string | null;
      name: string | null;
      confidence: number | null;
      matchedBy: string | null;
      candidates: OrakelMatchCandidate[];
    }
  | { ok: false; message: string };

const noMatch = (): FindMatchResult => ({
  ok: true,
  found: false,
  alreadySet: false,
  orgNumber: null,
  name: null,
  confidence: null,
  matchedBy: null,
  candidates: [],
});

// Never writes: setting the org number at ≥0.95 is the workflow's own next step, if its author
// wants it.
export const findMatch = async (
  company: TwentyCompany,
  settings: OrakelSettings,
  fetchImpl?: OrakelFetch,
): Promise<FindMatchResult> => {
  if (company.doNotEnrich) {
    return { ok: false, message: OFF_MESSAGE };
  }
  if (company.orgNumber) {
    return {
      ok: true,
      found: true,
      alreadySet: true,
      orgNumber: company.orgNumber,
      name: company.name,
      confidence: 1,
      matchedBy: 'org-number',
      candidates: [],
    };
  }
  if (!company.name) {
    return noMatch();
  }

  const result = await matchCompany(settings, company.name, normalizeDomain(company.domain), fetchImpl);
  if (!result.ok) {
    return result.kind === 'not-found' ? noMatch() : { ok: false, message: orakelFailureMessage(result) };
  }
  const best = result.data[0];
  if (!best) {
    return noMatch();
  }
  return {
    ok: true,
    found: true,
    alreadySet: false,
    orgNumber: best.orgNumber,
    name: best.name,
    confidence: best.confidence,
    matchedBy: best.matchedBy,
    candidates: result.data,
  };
};

// orakel-add-key-people

export type KeyRole = 'ceo' | 'boardChair';

export type AddKeyPeopleResult = {
  ok: boolean;
  message: string;
  added: { role: KeyRole; name: string; personId: string; noteError?: string }[];
  // `not-listed`: Orakel lists nobody in this role, or the person asked to be hidden.
  // `duplicate`: Twenty already has someone by that name; `existingPersonIds` says who.
  // `same-person`: the CEO is also board chair, and was handled once.
  skipped: {
    role: KeyRole;
    name: string | null;
    reason: 'not-listed' | 'duplicate' | 'same-person' | 'failed';
    existingPersonIds?: string[];
    message?: string;
  }[];
};

const KEY_ROLES: { role: KeyRole; pick: (card: OrakelCompanyCard) => string | null }[] = [
  { role: 'ceo', pick: (card) => card.intelligence.ceo },
  { role: 'boardChair', pick: (card) => card.intelligence.boardChair },
];

const sameName = (a: string, b: string) => normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();

// Creates the CEO and the board chair as Persons on the company through "+ Add" (`addPerson`):
// the same duplicate check by name (never forced), the same "Added from Orakel" note, and only
// people Orakel's card lists right now, so a suppressed person is skipped.
export const addKeyPeople = async (
  company: TwentyCompany,
  settings: OrakelSettings,
  deps: Omit<AddPersonDeps, 'card'> = {},
): Promise<AddKeyPeopleResult> => {
  const read = await readCard(company, settings, deps.fetchImpl);
  if (!read.ok) {
    return { ok: false, message: read.message, added: [], skipped: [] };
  }
  const listed = listedPeople(read.card);
  const result: AddKeyPeopleResult = { ok: true, message: '', added: [], skipped: [] };
  const handled: string[] = [];

  for (const { role, pick } of KEY_ROLES) {
    const raw = pick(read.card);
    const name = typeof raw === 'string' && raw.trim() !== '' && listed.includes(raw) ? raw : null;
    if (!name) {
      result.skipped.push({ role, name: null, reason: 'not-listed' });
      continue;
    }
    if (handled.some((done) => sameName(done, name))) {
      result.skipped.push({ role, name, reason: 'same-person' });
      continue;
    }
    handled.push(name);

    const added = await addPerson(company, { name, force: false }, settings, { ...deps, card: read.card });
    if (added.ok) {
      result.added.push({ role, name, personId: added.personId, ...(added.noteError ? { noteError: added.noteError } : {}) });
    } else if ('duplicates' in added) {
      result.skipped.push({ role, name, reason: 'duplicate', existingPersonIds: added.duplicates.map((person) => person.id) });
    } else {
      result.ok = false;
      result.skipped.push({ role, name, reason: 'failed', message: added.message });
    }
  }

  const failed = result.skipped.filter((skip) => skip.reason === 'failed');
  result.message = failed.length > 0
    ? failed.map((skip) => `${skip.name}: ${skip.message}`).join(' ')
    : `Added ${result.added.length}, skipped ${result.skipped.length}.`;
  return result;
};
