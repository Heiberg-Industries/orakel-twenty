import type { OrakelSettings } from 'src/catalog/settings';
import { normalizeDomain } from 'src/enrichment/enrich-company';
import type { CardState, OrakelCompanyCard, OrakelMatchCandidate } from 'src/widget/card-types';
import { callOrakel, type OrakelFailure, type OrakelFetch } from 'src/widget/orakel-client';
import type { TwentyCompany } from 'src/widget/twenty-company';

const MAX_SUGGESTIONS = 3;

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
    const result = await callOrakel<OrakelCompanyCard>(
      settings,
      `/api/companies/${encodeURIComponent(company.orgNumber)}/card`,
      {},
      fetchImpl,
    );
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

  const result = await callOrakel<{ candidates?: OrakelMatchCandidate[] }>(
    settings,
    '/api/companies/match',
    { query: { name: company.name, domain: crmDomain ?? undefined } },
    fetchImpl,
  );
  if (!result.ok) {
    return result.kind === 'not-found'
      ? { state: 'not-matched', suggestions: [], searchedName: company.name }
      : stateForFailure(result);
  }

  const suggestions = (Array.isArray(result.data.candidates) ? result.data.candidates : []).slice(
    0,
    MAX_SUGGESTIONS,
  );

  return { state: 'not-matched', suggestions, searchedName: company.name };
};
