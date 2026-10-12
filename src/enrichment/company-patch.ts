import { COMPANY_FIELD_ENTRIES, orakelFieldName } from 'src/catalog/company-fields';
import {
  buildEnrichmentValues,
  type OrakelCompany,
  type SlugValue,
  type TenderExtra,
} from 'src/enrichment/orakel-values';

// What to write on one Twenty company. Port of Orakel's `buildTwentyValues`
// (`lib/twenty/field-mappings.ts`), changed where the app differs:
// - every selected slug goes to its own `orakel<Slug>` field, not to a built-in;
// - the built-ins (`domainName`, `address` with lat/lng, `linkedinLink`, `employees`) are filled
//   only when they are empty, so a value Orakel didn't write is never changed or cleared;
// - a value Orakel doesn't have is left out, never sent as null (lesson ORA-59);
// - a value equal to what the record already holds is left out, so an unchanged company gets no
//   write at all.

export const ADDRESS_SLUGS = ['streetAddress', 'postalCode', 'municipality'];

const COUNTRY_NAME: Record<string, string> = { NO: 'Norway', SE: 'Sweden', DK: 'Denmark', FI: 'Finland' };

// Every `orakel*` field only the app can write (writability APPLICATION). A user or an API key
// cannot change these, so an update that touched one of them came from the app itself.
export const APP_WRITTEN_FIELD_NAMES = COMPANY_FIELD_ENTRIES.filter((entry) => !entry.userEditable).map(
  (entry) => orakelFieldName(entry.slug),
);

export type TwentyCompanyRecord = Record<string, unknown> & { id: string };

export type PatchContext = {
  // Slugs chosen in the app's "Fields to fill in" setting.
  selectedSlugs: string[];
  // Whether this workspace's Company has the built-in `employees` field (older workspaces only).
  hasEmployeesField: boolean;
  tenders?: TenderExtra;
};

const isBlank = (value: unknown) => value === null || value === undefined || value === '';

export const linkUrl = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim() || null;
  if (value && typeof value === 'object' && 'primaryLinkUrl' in value) {
    const url = (value as { primaryLinkUrl?: unknown }).primaryLinkUrl;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  }
  return null;
};

const isAddressEmpty = (value: unknown) => {
  if (!value || typeof value !== 'object') return true;
  const address = value as Record<string, unknown>;
  return ['addressStreet1', 'addressStreet2', 'addressCity', 'addressPostcode'].every((key) =>
    isBlank(typeof address[key] === 'string' ? (address[key] as string).trim() : address[key]),
  );
};

export const buildCompanyPatch = (
  record: TwentyCompanyRecord,
  company: OrakelCompany,
  context: PatchContext,
): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  const setIfChanged = (field: string, value: SlugValue) => {
    if (record[field] !== value) patch[field] = value;
  };

  // The org number is always written: it is the match key.
  setIfChanged(orakelFieldName('orgNumber'), company.orgNumber);

  const slugs = context.selectedSlugs.filter((slug) => slug !== 'orgNumber');
  const values = buildEnrichmentValues(company, slugs, context.tenders);

  for (const [slug, value] of Object.entries(values)) {
    setIfChanged(orakelFieldName(slug), value);
  }

  // Built-ins, only when empty.
  if (typeof values.website === 'string' && !linkUrl(record.domainName)) {
    patch.domainName = { primaryLinkUrl: values.website };
  }

  if (typeof values.linkedinUrl === 'string' && !linkUrl(record.linkedinLink)) {
    patch.linkedinLink = { primaryLinkUrl: values.linkedinUrl };
  }

  if (
    typeof values.employeeCount === 'number' &&
    context.hasEmployeesField &&
    isBlank(record.employees)
  ) {
    patch.employees = values.employeeCount;
  }

  const street = company.businessAddressStreet ?? '';
  const city = company.businessAddressCity ?? '';
  const postcode = company.businessAddressZip ?? '';
  if (
    slugs.some((slug) => ADDRESS_SLUGS.includes(slug)) &&
    (street || city || postcode) &&
    isAddressEmpty(record.address)
  ) {
    patch.address = {
      addressStreet1: street,
      addressStreet2: '',
      addressCity: city,
      addressPostcode: postcode,
      addressState: '',
      addressCountry: COUNTRY_NAME[(company.country ?? '').toUpperCase()] ?? company.country ?? '',
      addressLat: company.businessAddressLat ?? null,
      addressLng: company.businessAddressLng ?? null,
    };
  }

  return patch;
};
