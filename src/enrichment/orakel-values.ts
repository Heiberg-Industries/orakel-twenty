// Orakel's company profile → one value per catalog slug.
//
// Port of Orakel's `SLUG_TO_VALUE_FN` / `buildEnrichmentValues` (`lib/crm/company-fields.ts` on
// origin/main @ a1441e7a), rewritten over the public API's JSON instead of Orakel's database row.
// The same rows arrive from `GET /api/companies/{org}` and from each item of
// `POST /api/companies/enrich`: `financials` (all rows), `roles` (not resigned, by sortOrder) and
// `ownership` (the ten largest holders of the latest year, from Orakel's shareholder summary).

export type OrakelFinancialRow = {
  periodTo?: string | null;
  regnskapstype?: string | null;
  revenue?: number | null;
  operatingResult?: number | null;
  totalEquity?: number | null;
  totalAssets?: number | null;
  netResult?: number | null;
};

export type OrakelRole = {
  roleTypeCode?: string | null;
  roleGroupCode?: string | null;
  isResigned?: boolean | null;
  personFirstName?: string | null;
  personMiddleName?: string | null;
  personLastName?: string | null;
  entityName?: string | null;
  entityOrgNumber?: string | null;
};

export type OrakelTopHolder = {
  name: string;
  orgNumber?: string | null;
  kind: string; // person | company | foreign
  pct: number;
};

export type OrakelOwnership = {
  year: number;
  holderCount: number;
  topHolders: OrakelTopHolder[];
};

export type OrakelCompany = {
  orgNumber: string;
  country?: string | null;
  name?: string | null;
  employeeCount?: number | null;
  orgFormCode?: string | null;
  naceDescription1?: string | null;
  isBankrupt?: boolean | null;
  primaryDomain?: string | null;
  website?: string | null;
  technologies?: { name: string }[] | null;
  linkedinHandle?: string | null;
  businessAddressStreet?: string | null;
  businessAddressZip?: string | null;
  businessAddressCity?: string | null;
  businessAddressLat?: number | null;
  businessAddressLng?: number | null;
  parentOrgNumber?: string | null;
  parentCompanyName?: string | null;
  updatedAt?: string | null;
  financials?: OrakelFinancialRow[] | null;
  roles?: OrakelRole[] | null;
  ownership?: OrakelOwnership | null;
};

// From `GET /api/companies/{org}/card` (`intelligence`). Not in the company profile.
export type TenderExtra = {
  activeTenders?: number | null;
  latestTenderUrl?: string | null;
};

export type SlugValue = string | number | boolean;

// Orakel's `latestCompanyAccounts`: drop group accounts, newest period first, and on a tie
// Brreg's own row beats the PDF-only SELSKAPSREGNSKAP row.
export const latestAccounts = (rows: OrakelFinancialRow[] | null | undefined) => {
  const periodTime = (row: OrakelFinancialRow) => (row.periodTo ? Date.parse(row.periodTo) : 0);
  const isPdfOnly = (row: OrakelFinancialRow) => Number(row.regnskapstype === 'SELSKAPSREGNSKAP');

  return [...(rows ?? [])]
    .filter((row) => row.regnskapstype !== 'KONSERN')
    .sort((a, b) => periodTime(b) - periodTime(a) || isPdfOnly(a) - isPdfOnly(b))[0];
};

const personName = (role: OrakelRole) =>
  [role.personFirstName, role.personMiddleName, role.personLastName].filter(Boolean).join(' ');

// Orakel's `extractKeyPeople` (`lib/push/adapters/attio.ts`).
export const keyPeople = (roles: OrakelRole[] | null | undefined) => {
  const active = (roles ?? []).filter((role) => !role.isResigned);
  const byType = (code: string) => active.find((role) => role.roleTypeCode === code);
  const firm = (group: string) => {
    const role = active.find((candidate) => candidate.roleGroupCode === group);
    return role ? { name: role.entityName ?? personName(role), orgNumber: role.entityOrgNumber ?? null } : null;
  };
  const ceo = byType('DAGL');
  const chair = byType('LEDE');
  const members = active
    .filter((role) => role.roleTypeCode === 'MEDL')
    .map(personName)
    .filter(Boolean)
    .join(', ');

  return {
    ceo: ceo ? personName(ceo) : null,
    boardChair: chair ? personName(chair) : null,
    boardMembers: members || null,
    auditor: firm('REVI'),
    accountingFirm: firm('REGN'),
  };
};

// The ten largest holders are enough here: a majority owner or the largest holder is always among them.
const latestYearOwnership = (ownership: OrakelOwnership | null | undefined) =>
  (ownership?.topHolders ?? []).map((holder) => ({
    name: holder.name,
    isPerson: holder.kind === 'person',
    pct: holder.pct,
  }));

const topHolder = (company: OrakelCompany) => {
  const holders = latestYearOwnership(company.ownership);
  return holders.length === 0 ? null : holders.reduce((a, b) => (a.pct > b.pct ? a : b));
};

const stripProtocol = (url: string | null | undefined) =>
  url ? url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || null : null;

type ValueFn = (company: OrakelCompany, extra: TenderExtra) => SlugValue | null | undefined;

export const SLUG_TO_VALUE_FN: Record<string, ValueFn> = {
  orgNumber: (c) => c.orgNumber,
  companyName: (c) => c.name,
  employeeCount: (c) => c.employeeCount,
  orgForm: (c) => c.orgFormCode,
  industryNace: (c) => c.naceDescription1,
  revenue: (c) => latestAccounts(c.financials)?.revenue,
  operatingProfit: (c) => latestAccounts(c.financials)?.operatingResult,
  equity: (c) => latestAccounts(c.financials)?.totalEquity,
  totalAssets: (c) => latestAccounts(c.financials)?.totalAssets,
  netResult: (c) => latestAccounts(c.financials)?.netResult,
  ceoName: (c) => keyPeople(c.roles).ceo,
  boardChair: (c) => keyPeople(c.roles).boardChair,
  boardMembers: (c) => keyPeople(c.roles).boardMembers,
  auditorName: (c) => keyPeople(c.roles).auditor?.name,
  auditorOrgNumber: (c) => keyPeople(c.roles).auditor?.orgNumber,
  accountingFirmName: (c) => keyPeople(c.roles).accountingFirm?.name,
  accountingFirmOrgNumber: (c) => keyPeople(c.roles).accountingFirm?.orgNumber,
  website: (c) => c.primaryDomain ?? stripProtocol(c.website),
  techStack: (c) => (c.technologies?.length ? c.technologies.map((tech) => tech.name).join(', ') : null),
  linkedinUrl: (c) => (c.linkedinHandle ? `https://linkedin.com/company/${c.linkedinHandle}` : null),
  streetAddress: (c) => c.businessAddressStreet,
  postalCode: (c) => c.businessAddressZip,
  municipality: (c) => c.businessAddressCity,
  isBankrupt: (c) => c.isBankrupt,
  activeTenders: (_c, extra) => extra.activeTenders,
  latestTenderUrl: (_c, extra) => extra.latestTenderUrl,
  isSubsidiary: (c) => {
    if (c.parentOrgNumber != null) return true;
    return latestYearOwnership(c.ownership).some((holder) => !holder.isPerson && holder.pct >= 50);
  },
  parentCompanyName: (c) => {
    if (c.parentCompanyName != null) return c.parentCompanyName;
    if (c.parentOrgNumber) return c.parentOrgNumber;
    let best: { name: string; pct: number } | null = null;
    for (const holder of latestYearOwnership(c.ownership)) {
      if (!holder.isPerson && holder.pct >= 50 && holder.pct > (best?.pct ?? 0)) best = holder;
    }
    return best?.name ?? null;
  },
  majorityOwner: (c) => {
    const top = topHolder(c);
    return top && top.pct >= 50 ? `${top.name} (${top.pct.toFixed(1)}%)` : null;
  },
  largestShareholder: (c) => {
    const top = topHolder(c);
    return top ? `${top.name} (${top.pct.toFixed(1)}%)` : null;
  },
};

// Slug → value for the requested slugs. Null, undefined and "" are left out (never-clear rule).
export const buildEnrichmentValues = (
  company: OrakelCompany,
  slugs: string[],
  extra: TenderExtra = {},
): Record<string, SlugValue> => {
  const values: Record<string, SlugValue> = {};
  for (const slug of slugs) {
    const value = SLUG_TO_VALUE_FN[slug]?.(company, extra);
    if (value !== null && value !== undefined && value !== '') {
      values[slug] = value;
    }
  }
  return values;
};
