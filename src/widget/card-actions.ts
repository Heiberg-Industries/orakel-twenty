import type { OrakelSettings } from 'src/catalog/settings';
import { normalizeDomain } from 'src/enrichment/enrich-company';
import { detectCountry } from 'src/enrichment/orakel-api';
import type {
  ContactsResult,
  FinancialHistoryResult,
  OwnershipData,
  OwnershipGroupNode,
  OrakelContacts,
  ResolveDomainResult,
  ShareholderRow,
} from 'src/widget/card-types';
import { callOrakel, type OrakelFailure, type OrakelFetch } from 'src/widget/orakel-client';
import type { TwentyCompany } from 'src/widget/twenty-company';

// The widget's Orakel actions besides the card itself. Each acts on the company record as read
// by the person who clicked, never on values the widget sends, so nobody can act on a company they
// can't see.

// `POST /api/companies/{org}/financial-history` blocks until Orakel has read up to 5 years of
// annual-report PDFs (about 45 s on the first call; later calls skip years already read). Orakel
// sets no timeout of its own and Twenty adds none to an app route (spec §9 #9), so this waits for it.
export const FINANCIAL_HISTORY_TIMEOUT_MS = 170_000;

export const fetchOwnership = async (
  company: TwentyCompany,
  settings: OrakelSettings,
  fetchImpl?: OrakelFetch,
): Promise<OwnershipData> => {
  if (company.doNotEnrich) {
    return unavailableOwnership('Orakel is turned off for this company.');
  }
  if (!company.orgNumber) {
    return unavailableOwnership('This company has no org number yet.');
  }
  if (detectCountry(company.orgNumber) !== 'NO') {
    return unavailableOwnership('Ownership data is only available for Norwegian companies.');
  }

  const org = encodeURIComponent(company.orgNumber);
  const [shareholdersResult, groupResult] = await Promise.all([
    callOrakel<{ data?: ShareholderRow[]; availableYears?: number[] }>(
      settings,
      `/api/companies/${org}/shareholders`,
      {},
      fetchImpl,
    ),
    callOrakel<{ root?: OwnershipGroupNode; totalMembers?: number; message?: string }>(
      settings,
      `/api/companies/${org}/group`,
      {},
      fetchImpl,
    ),
  ]);

  const years = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
  const shareholders = shareholdersResult.ok
    ? {
        data: Array.isArray(shareholdersResult.data.data)
          ? shareholdersResult.data.data.filter(
              (row): row is ShareholderRow =>
                typeof row?.ownershipPct === 'number' &&
                (typeof row.shareholderName === 'string' || row.shareholderName === null || row.shareholderName === undefined),
            )
          : [],
        availableYears: years(shareholdersResult.data.availableYears),
      }
    : null;
  const group = groupResult.ok && groupResult.data.root
    ? {
        root: groupResult.data.root,
        totalMembers: typeof groupResult.data.totalMembers === 'number' ? groupResult.data.totalMembers : 1,
        message: typeof groupResult.data.message === 'string' ? groupResult.data.message : undefined,
      }
    : null;

  return {
    shareholders,
    group,
    shareholdersError: shareholdersResult.ok ? null : orakelFailureMessage(shareholdersResult),
    groupError: groupResult.ok ? null : orakelFailureMessage(groupResult),
  };
};

const unavailableOwnership = (unavailableMessage: string): OwnershipData => ({
  shareholders: null,
  group: null,
  shareholdersError: null,
  groupError: null,
  unavailableMessage,
});

export const orakelFailureMessage = (failure: OrakelFailure): string => {
  switch (failure.kind) {
    case 'no-key':
      return 'No Orakel API key is set for this workspace.';
    case 'invalid-key':
      return 'Orakel does not recognise the API key.';
    case 'no-account':
      return 'The Orakel API key is not linked to an Orakel account.';
    case 'payment-required':
      return failure.trialExpired ? 'The Orakel trial has expired.' : 'The Orakel account has no active subscription.';
    case 'not-found':
      return 'Orakel does not know this org number.';
    case 'forbidden':
    case 'bad-request':
    case 'rate-limited':
    case 'unreachable':
    case 'unexpected':
      return failure.message;
  }
};

export const fetchFinancialHistory = async (
  company: TwentyCompany,
  settings: OrakelSettings,
  fetchImpl?: OrakelFetch,
): Promise<FinancialHistoryResult> => {
  if (!company.orgNumber) {
    return { ok: false, message: 'This company has no org number yet.' };
  }
  // Orakel reads annual-report PDFs from the Norwegian register only.
  if (detectCountry(company.orgNumber) !== 'NO') {
    return { ok: false, message: 'The 5-year history is only available for Norwegian companies.' };
  }

  const result = await callOrakel<{ syncResult?: { years?: unknown[] } }>(
    settings,
    `/api/companies/${encodeURIComponent(company.orgNumber)}/financial-history`,
    { method: 'POST', timeoutMs: FINANCIAL_HISTORY_TIMEOUT_MS },
    fetchImpl,
  );
  if (!result.ok) {
    return { ok: false, message: orakelFailureMessage(result) };
  }

  const years = result.data.syncResult?.years;
  return { ok: true, extractedYears: Array.isArray(years) ? years.length : 0 };
};

// The domain-conflict picker's "use the CRM's website": sends the company's Twenty website to
// Orakel's review queue (`POST /api/companies/{org}/domain`). Orakel never overwrites its own
// website directly; a person reviews the proposal. Off when the workspace turned website sharing
// off, as the HubSpot card does for `contributeToDatabase: false`.
export const proposeCrmDomain = async (
  company: TwentyCompany,
  settings: OrakelSettings,
  fetchImpl?: OrakelFetch,
): Promise<ResolveDomainResult> => {
  const domain = normalizeDomain(company.domain);

  if (!company.orgNumber) {
    return { ok: false, message: 'This company has no org number yet.' };
  }
  if (!domain) {
    return { ok: false, message: 'This company has no website in Twenty.' };
  }
  if (!settings.contributeDomains) {
    return { ok: true, queued: false, skipped: 'sharing-off' };
  }
  // Orakel's domain route only takes Norwegian org numbers today.
  if (detectCountry(company.orgNumber) !== 'NO') {
    return { ok: true, queued: false, skipped: 'not-norwegian' };
  }

  const result = await callOrakel<{ queued?: unknown }>(
    settings,
    `/api/companies/${encodeURIComponent(company.orgNumber)}/domain`,
    { method: 'POST', body: { domain } },
    fetchImpl,
  );
  if (!result.ok) {
    return { ok: false, message: orakelFailureMessage(result) };
  }

  return { ok: true, queued: result.data.queued === true };
};

// Find contacts in the card's header: Orakel scrapes the company's own website once, on this click,
// and never in bulk (spec §7 #3). Orakel takes Norwegian org numbers only and allows 20 such calls
// per account per 15 minutes (429, shown as written).
export const CONTACTS_TIMEOUT_MS = 60_000;

export const findContacts = async (
  company: TwentyCompany,
  settings: OrakelSettings,
  fetchImpl?: OrakelFetch,
): Promise<ContactsResult> => {
  if (company.doNotEnrich) {
    return { ok: false, message: 'Orakel is turned off for this company ("Do not enrich").' };
  }
  if (!company.orgNumber) {
    return { ok: false, message: 'This company has no org number yet.' };
  }
  if (detectCountry(company.orgNumber) !== 'NO') {
    return { ok: false, message: 'Find contacts is only available for Norwegian companies.' };
  }

  const result = await callOrakel<Partial<OrakelContacts>>(
    settings,
    `/api/companies/${encodeURIComponent(company.orgNumber)}/contacts`,
    { timeoutMs: CONTACTS_TIMEOUT_MS },
    fetchImpl,
  );
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.kind === 'unexpected' && result.status === 502
          ? "Orakel could not read the company's website."
          : orakelFailureMessage(result),
    };
  }

  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
  return {
    ok: true,
    contacts: {
      emails: strings(result.data.emails),
      phones: strings(result.data.phones),
      noWebsite: result.data.noWebsite === true,
    },
  };
};
