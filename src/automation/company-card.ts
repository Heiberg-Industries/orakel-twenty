import type { OrakelSettings } from 'src/catalog/settings';
import { orakelFailureMessage } from 'src/widget/card-actions';
import type { OrakelCompanyCard } from 'src/widget/card-types';
import { fetchCompanyCard } from 'src/widget/load-card';
import type { OrakelFetch } from 'src/widget/orakel-client';
import type { TwentyCompany } from 'src/widget/twenty-company';

// Reading one company's Orakel card for the workflow actions and the AI tools. Read-only, so the
// AI tools can depend on it without reaching any code that writes.

export const OFF_MESSAGE = 'Orakel is turned off for this company ("Do not enrich").';
export const NO_ORG_NUMBER_MESSAGE = 'This company has no org number yet.';

// The company's card, or why there is none.
export const readCard = async (
  company: TwentyCompany,
  settings: OrakelSettings,
  fetchImpl?: OrakelFetch,
): Promise<{ ok: true; card: OrakelCompanyCard } | { ok: false; message: string }> => {
  if (company.doNotEnrich) {
    return { ok: false, message: OFF_MESSAGE };
  }
  if (!company.orgNumber) {
    return { ok: false, message: NO_ORG_NUMBER_MESSAGE };
  }
  const result = await fetchCompanyCard(settings, company.orgNumber, fetchImpl);
  return result.ok ? { ok: true, card: result.data } : { ok: false, message: orakelFailureMessage(result) };
};

export type CompanyStatus = 'active' | 'bankrupt' | 'being-dissolved';

export const companyStatus = (overview: OrakelCompanyCard['overview']): CompanyStatus =>
  overview.isBankrupt ? 'bankrupt' : overview.isBeingDissolved ? 'being-dissolved' : 'active';
