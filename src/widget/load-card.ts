import type { OrakelSettings } from 'src/catalog/settings';
import { normalizeDomain } from 'src/enrichment/enrich-company';
import type { CardState, OrakelCompanyCard, OrakelMatchCandidate } from 'src/widget/card-types';
import { callOrakel, type OrakelFailure, type OrakelFetch, type OrakelResult } from 'src/widget/orakel-client';
import type { TwentyCompany } from 'src/widget/twenty-company';

const MAX_SUGGESTIONS = 3;

// `GET /api/companies/{org}/card`. Orakel leaves out everyone who asked to be hidden
// (`filterSuppressedRoles`), so nothing built on the card can show or create them.
export const fetchCompanyCard = (
  settings: OrakelSettings,
  orgNumber: string,
  fetchImpl?: OrakelFetch,
): Promise<OrakelResult<OrakelCompanyCard>> =>
  callOrakel<OrakelCompanyCard>(settings, `/api/companies/${encodeURIComponent(orgNumber)}/card`, {}, fetchImpl);

// `GET /api/companies/match`: candidates for a name (and website), best first. Never writes.
export const matchCompany = async (
  settings: OrakelSettings,
  name: string,
  domain: string | null,
  fetchImpl?: OrakelFetch,
): Promise<OrakelResult<OrakelMatchCandidate[]>> => {
  const result = await callOrakel<{ candidates?: OrakelMatchCandidate[] }>(
    settings,
    '/api/companies/match',
    { query: { name, domain: domain ?? undefined } },
    fetchImpl,
  );
  if (!result.ok) {
    return result;
  }
  const candidates = Array.isArray(result.data.candidates) ? result.data.candidates : [];
  return { ok: true, data: candidates.slice(0, MAX_SUGGESTIONS) };
};

// Every Orakel failure the widget shows as its own state. `not-found` is handled by the caller,
// because it means different things for the card and for the match.
export const stateForFailure = (failure: OrakelFailure): CardState => {
  switch (failure.kind) {
    case 'no-key':
      return { state: 'no-key' };
    case 'invalid-key':
    case 'no-account':
      return { state: 'key-problem', reason: failure.kind };
    case 'payment-required':
      return { state: 'payment-required', trialExpired: failure.trialExpired, upgradeUrl: failure.upgradeUrl };
    case 'rate-limited':
      return { state: 'rate-limited', message: failure.message };
    case 'not-found':
      return { state: 'error', message: 'Orakel did not find this company.' };
    case 'unexpected':
    case 'forbidden':
    case 'bad-request':
    case 'unreachable':
      return { state: 'error', message: failure.message };
  }
};

// Order: opted out, no key, then the card (org number set) or the match (no org number).
// Matching never writes: below or above 0.95, the widget only suggests; a person clicks "Use this".
export const loadCardState = async (
  company: TwentyCompany,
  settings: OrakelSettings,
  fetchImpl?: OrakelFetch,
): Promise<CardState> => {
  if (company.doNotEnrich) {
    return { state: 'opted-out' };
  }
  if (!settings.apiKey) {
    return { state: 'no-key' };
  }

  const crmDomain = normalizeDomain(company.domain);

  if (company.orgNumber) {
    const result = await fetchCompanyCard(settings, company.orgNumber, fetchImpl);
    if (result.ok) {
      return {
        state: 'ready',
        card: result.data,
        hiddenCardFields: settings.hiddenCardFields,
        orakelDomain: normalizeDomain(result.data.overview?.domain),
        crmDomain,
      };
    }
    if (result.kind === 'not-found') {
      return { state: 'not-in-orakel', orgNumber: company.orgNumber };
    }
    return stateForFailure(result);
  }

  if (!company.name) {
    return { state: 'not-matched', suggestions: [], searchedName: null };
  }

  const result = await matchCompany(settings, company.name, crmDomain, fetchImpl);
  if (!result.ok) {
    return result.kind === 'not-found'
      ? { state: 'not-matched', suggestions: [], searchedName: company.name }
      : stateForFailure(result);
  }

  return { state: 'not-matched', suggestions: result.data, searchedName: company.name };
};
