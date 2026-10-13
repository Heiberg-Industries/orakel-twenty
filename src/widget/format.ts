import type { OrakelCompanyCard, OrakelFinancialYear } from 'src/widget/card-types';

// Display helpers ported from the HubSpot card (orakel `hubspot-extension/.../OrakelCard.jsx`), so
// both CRMs show a company the same way.

export const truncate = (text: string | null | undefined, maxLength: number) => {
  if (!text) {
    return text ?? null;
  }
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
};

export const foundingYear = (isoDate: string | null) => {
  if (!isoDate) {
    return null;
  }
  const year = Number.parseInt(isoDate.slice(0, 4), 10);
  return Number.isFinite(year) ? String(year) : null;
};

// Amounts in millions: "1.2M", "45M", "3.4B".
export const formatMillions = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  const millions = value / 1_000_000;
  const abs = Math.abs(millions);
  if (abs >= 1000) {
    return `${(millions / 1000).toFixed(1)}B`;
  }
  if (abs >= 10) {
    return `${millions.toFixed(0)}M`;
  }
  return `${millions.toFixed(1)}M`;
};

const COUNTRY_CURRENCY: Record<string, string> = { NO: 'NOK', SE: 'SEK', DK: 'DKK', FI: 'EUR' };

export const currencyFor = (country: string) => COUNTRY_CURRENCY[country] ?? null;

type Overview = OrakelCompanyCard['overview'];

const joinPresent = (parts: (string | null | undefined)[], separator: string) => {
  const present = parts.filter((part): part is string => typeof part === 'string' && part.trim() !== '');
  return present.length > 0 ? present.join(separator) : null;
};

export const addressLine = (overview: Overview) =>
  joinPresent([overview.street, joinPresent([overview.zip, overview.city], ' ')], ', ');

export const industryLine = (overview: Overview) =>
  joinPresent([truncate(overview.naceDescription, 40), overview.naceCode], ' · ');

export const legalFormLine = (overview: Overview) =>
  overview.orgFormCode ? joinPresent([overview.orgFormCode, overview.orgFormDescription], ' · ') : null;

export type FinancialColumn = {
  key: Exclude<keyof OrakelFinancialYear, 'year'>;
  label: string;
};

// Revenue and Equity only when at least one year has them, as on the HubSpot card.
export const financialColumns = (rows: OrakelFinancialYear[]): FinancialColumn[] => {
  const columns: FinancialColumn[] = [];
  if (rows.some((row) => row.revenue !== null)) {
    columns.push({ key: 'revenue', label: 'Revenue' });
  }
  columns.push(
    { key: 'operatingResult', label: 'Op. result' },
    { key: 'netResult', label: 'Net result' },
    { key: 'totalAssets', label: 'Assets' },
  );
  if (rows.some((row) => row.totalEquity !== null)) {
    columns.push({ key: 'totalEquity', label: 'Equity' });
  }
  return columns;
};

// The Website row and its conflict picker. A conflict is two different websites, compared as bare
// hosts (`normalizeDomain`, done by the card function), with neither one picked yet.
export type WebsiteView = {
  displayDomain: string | null;
  conflict: { orakelDomain: string; crmDomain: string } | null;
};

export const websiteView = (
  orakelDomain: string | null,
  crmDomain: string | null,
  pickedDomain: string | null,
): WebsiteView => {
  const conflict =
    orakelDomain && crmDomain && orakelDomain !== crmDomain && !pickedDomain
      ? { orakelDomain, crmDomain }
      : null;

  return { displayDomain: pickedDomain ?? orakelDomain ?? crmDomain, conflict };
};
