import {
  type defineField,
  FieldType,
  MetadataWritability,
  STANDARD_OBJECT,
} from 'twenty-sdk/define';

// Every field the app adds to Company. One entry per Orakel catalog slug
// (`orakel-crm-fields.snapshot.ts`), plus the `doNotEnrich` control field.
//
// Naming: `orakel` + the slug in PascalCase. The prefix keeps the app's fields apart from
// fields created by hand or by the old provisioning script: an app cannot take over a field
// that already exists under the same name.
//
// Uninstalling the app permanently deletes all of these fields and their values.

type OrakelFieldType = FieldType.TEXT | FieldType.NUMBER | FieldType.BOOLEAN;

export type CompanyFieldEntry = {
  slug: string;
  label: string;
  type: OrakelFieldType;
  universalIdentifier: string;
  // Set by the user, so it must stay editable in the UI. Everything else is written by the app only.
  userEditable?: boolean;
};

export const COMPANY_FIELD_ENTRIES: CompanyFieldEntry[] = [
  { slug: 'orgNumber', label: 'Org number', type: FieldType.TEXT, universalIdentifier: '65777ee0-bb81-403f-8bcd-3b882783cd68', userEditable: true },
  { slug: 'companyName', label: 'Company name', type: FieldType.TEXT, universalIdentifier: '10cd93fb-ac44-424b-a030-1c57ff8324f8' },
  { slug: 'employeeCount', label: 'Employees', type: FieldType.NUMBER, universalIdentifier: 'c408b872-1684-4048-b721-5dc930c29f2a' },
  { slug: 'orgForm', label: 'Org form', type: FieldType.TEXT, universalIdentifier: 'f88d9555-6932-4a91-b248-b7c14d17a0f2' },
  { slug: 'isBankrupt', label: 'Is bankrupt', type: FieldType.BOOLEAN, universalIdentifier: '592e42c9-eee8-4502-9da1-c60c1ad101d3' },
  { slug: 'industryNace', label: 'Industry (NACE)', type: FieldType.TEXT, universalIdentifier: '0df255bb-4a4a-40e0-bc06-84d44545bcc2' },
  { slug: 'revenue', label: 'Revenue', type: FieldType.NUMBER, universalIdentifier: '809458b3-14a2-4cbd-bc7a-214369fc7fa1' },
  { slug: 'operatingProfit', label: 'Operating profit', type: FieldType.NUMBER, universalIdentifier: '90fc8ae5-ad8e-4995-911a-af589fd25d9e' },
  { slug: 'equity', label: 'Equity', type: FieldType.NUMBER, universalIdentifier: '0bdd034d-b7a9-45b3-b89e-348137fa1b2e' },
  { slug: 'totalAssets', label: 'Total assets', type: FieldType.NUMBER, universalIdentifier: '57fd9a47-698b-415b-8344-4fa5fb188645' },
  { slug: 'netResult', label: 'Net result', type: FieldType.NUMBER, universalIdentifier: '42401285-3d41-402c-b10c-607500c0848e' },
  { slug: 'ceoName', label: 'CEO name', type: FieldType.TEXT, universalIdentifier: 'c9d14c2f-4928-48a3-afaa-3d2aaf81788c' },
  { slug: 'boardChair', label: 'Board chair', type: FieldType.TEXT, universalIdentifier: '51c09565-21c9-4227-9eeb-9c2a9b88a12b' },
  { slug: 'boardMembers', label: 'Board members', type: FieldType.TEXT, universalIdentifier: '50e8d2fc-7872-4cf5-bf26-29bdda23b5fe' },
  { slug: 'website', label: 'Website', type: FieldType.TEXT, universalIdentifier: '7f880577-f72f-4c29-9d53-ff03abe53da8' },
  { slug: 'techStack', label: 'Tech stack', type: FieldType.TEXT, universalIdentifier: '769d0cbb-bdb6-4590-b148-d5f1c0a9bba2' },
  { slug: 'linkedinUrl', label: 'LinkedIn', type: FieldType.TEXT, universalIdentifier: '37ce987d-2f01-4c93-951b-76a4381cdd37' },
  { slug: 'activeTenders', label: 'Active tenders', type: FieldType.NUMBER, universalIdentifier: '070e83a9-5298-40f3-8287-2dcd805d3206' },
  { slug: 'latestTenderUrl', label: 'Latest tender URL', type: FieldType.TEXT, universalIdentifier: 'c7b8615f-6fef-4be3-a2a5-3523b5341a53' },
  { slug: 'streetAddress', label: 'Street address', type: FieldType.TEXT, universalIdentifier: 'dc3ebbd0-49f7-4152-b9ae-6ab216626829' },
  { slug: 'postalCode', label: 'Postal code', type: FieldType.TEXT, universalIdentifier: 'ddf0bb6f-8a27-4c7d-b5c9-8946667a8dfb' },
  { slug: 'municipality', label: 'Municipality', type: FieldType.TEXT, universalIdentifier: '44e8142c-af49-4f84-80a2-e53a96a46d7b' },
  { slug: 'auditorName', label: 'Auditor', type: FieldType.TEXT, universalIdentifier: 'e468220d-4e37-40ff-be05-70c0b5e0ba2c' },
  { slug: 'auditorOrgNumber', label: 'Auditor org number', type: FieldType.TEXT, universalIdentifier: '70132be8-3075-421e-94ac-91abaf8d1493' },
  { slug: 'accountingFirmName', label: 'Accounting firm', type: FieldType.TEXT, universalIdentifier: '478f9a83-e602-4d4d-9c88-4065e5ca776e' },
  { slug: 'accountingFirmOrgNumber', label: 'Accounting firm org number', type: FieldType.TEXT, universalIdentifier: 'c7a36d48-2f62-4248-8ef4-6d616e7f6886' },
  { slug: 'isSubsidiary', label: 'Is subsidiary', type: FieldType.BOOLEAN, universalIdentifier: '21a1e6de-0e6c-4fb9-8219-547d2d78190f' },
  { slug: 'parentCompanyName', label: 'Parent company', type: FieldType.TEXT, universalIdentifier: '4349755a-bce0-4e3d-b2d3-8eab17926d96' },
  { slug: 'majorityOwner', label: 'Majority owner', type: FieldType.TEXT, universalIdentifier: '728f586f-4387-4296-97b7-384de96e041f' },
  { slug: 'largestShareholder', label: 'Largest shareholder', type: FieldType.TEXT, universalIdentifier: '6988dc28-3328-42da-8d68-c7a56bb36f72' },
  // Control field, not in Orakel's catalog: lets a user stop enrichment of one company
  // (a wrong match, or an internal company) so their own values are never overwritten.
  { slug: 'doNotEnrich', label: 'Do not enrich', type: FieldType.BOOLEAN, universalIdentifier: '29eec049-158f-44e6-bd09-a6072bb4052f', userEditable: true },
];

export const orakelFieldName = (slug: string) =>
  `orakel${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;

export const getCompanyFieldEntry = (slug: string): CompanyFieldEntry => {
  const entry = COMPANY_FIELD_ENTRIES.find((candidate) => candidate.slug === slug);

  if (!entry) {
    throw new Error(`Unknown Orakel company field slug: ${slug}`);
  }

  return entry;
};

type FieldManifest = Parameters<typeof defineField>[0];

// The manifest passed to `defineField` in each `src/fields/*.field.ts` file.
export const companyFieldManifest = (slug: string): FieldManifest => {
  const entry = getCompanyFieldEntry(slug);

  return {
    universalIdentifier: entry.universalIdentifier,
    objectUniversalIdentifier: STANDARD_OBJECT.company.universalIdentifier,
    type: entry.type,
    name: orakelFieldName(entry.slug),
    label: entry.label,
    description: entry.userEditable
      ? 'Orakel. Set by you; the app reads it.'
      : 'Orakel. Written by the Orakel app; deleted if the app is uninstalled.',
    icon: 'IconBuildingSkyscraper',
    isNullable: true as const,
    writability: entry.userEditable ? MetadataWritability.OPEN : MetadataWritability.APPLICATION,
  } as FieldManifest;
};
