// Snapshot of Orakel's CRM field catalog — the list the app mirrors on Company.
//
// Copied verbatim (slug, label, category, countries) from orakel
// `lib/crm/fields.ts` `CRM_FIELDS` and `DEFAULT_FIELD_SELECTION`, origin/main @ 62943358, 2026-10-01.
//
// REFRESH when Orakel adds, removes or renames a catalog field:
//   git -C ~/Developer/orakel show origin/main:lib/crm/fields.ts
// then update this file, add or remove the matching entry in `company-fields.ts`, and run
// `yarn test:unit` — `field-catalog.test.ts` fails until the two agree.

export type OrakelCrmField = {
  slug: string;
  label: string;
  category: string;
  countries?: string[];
};

export const ORAKEL_CRM_FIELDS: OrakelCrmField[] = [
  { slug: 'orgNumber', label: 'Org number', category: 'Firmographics' },
  { slug: 'companyName', label: 'Company name', category: 'Firmographics' },
  { slug: 'employeeCount', label: 'Employees', category: 'Firmographics' },
  { slug: 'orgForm', label: 'Org form', category: 'Firmographics' },
  { slug: 'isBankrupt', label: 'Is bankrupt', category: 'Firmographics' },
  { slug: 'industryNace', label: 'Industry (NACE)', category: 'Firmographics' },
  { slug: 'revenue', label: 'Revenue', category: 'Financials' },
  { slug: 'operatingProfit', label: 'Operating profit', category: 'Financials' },
  { slug: 'equity', label: 'Equity', category: 'Financials' },
  { slug: 'totalAssets', label: 'Total assets', category: 'Financials' },
  { slug: 'netResult', label: 'Net result', category: 'Financials' },
  { slug: 'ceoName', label: 'CEO name', category: 'Key people' },
  { slug: 'boardChair', label: 'Board chair', category: 'Key people' },
  { slug: 'boardMembers', label: 'Board members', category: 'Key people' },
  { slug: 'website', label: 'Website', category: 'Web & tech' },
  { slug: 'techStack', label: 'Tech stack', category: 'Web & tech' },
  { slug: 'linkedinUrl', label: 'LinkedIn', category: 'Web & tech' },
  { slug: 'activeTenders', label: 'Active tenders', category: 'Procurement', countries: ['NO'] },
  { slug: 'latestTenderUrl', label: 'Latest tender URL', category: 'Procurement', countries: ['NO'] },
  { slug: 'streetAddress', label: 'Street address', category: 'Address' },
  { slug: 'postalCode', label: 'Postal code', category: 'Address' },
  { slug: 'municipality', label: 'Municipality', category: 'Address' },
  { slug: 'auditorName', label: 'Auditor', category: 'Advisors', countries: ['NO'] },
  { slug: 'auditorOrgNumber', label: 'Auditor org number', category: 'Advisors', countries: ['NO'] },
  { slug: 'accountingFirmName', label: 'Accounting firm', category: 'Advisors', countries: ['NO'] },
  { slug: 'accountingFirmOrgNumber', label: 'Accounting firm org number', category: 'Advisors', countries: ['NO'] },
  { slug: 'isSubsidiary', label: 'Is subsidiary', category: 'Corporate structure' },
  { slug: 'parentCompanyName', label: 'Parent company', category: 'Corporate structure' },
  { slug: 'majorityOwner', label: 'Majority owner', category: 'Corporate structure', countries: ['NO'] },
  { slug: 'largestShareholder', label: 'Largest shareholder', category: 'Corporate structure', countries: ['NO'] },
];

export const ORAKEL_DEFAULT_FIELD_SELECTION = [
  'companyName',
  'employeeCount',
  'revenue',
  'ceoName',
  'website',
  'streetAddress',
  'postalCode',
];
