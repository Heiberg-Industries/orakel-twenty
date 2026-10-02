import { ORAKEL_CRM_FIELDS, ORAKEL_DEFAULT_FIELD_SELECTION } from 'src/catalog/orakel-crm-fields.snapshot';

// Application variables. Twenty hands every variable to logic functions as a
// string in `process.env`; MULTI_SELECT and BOOLEAN arrive JSON-encoded.

export const DEFAULT_ORAKEL_BASE_URL = 'https://orakel.cloud';

export const ORAKEL_FIELD_OPTIONS = ORAKEL_CRM_FIELDS.map(({ slug, label }) => ({
  label,
  value: slug,
}));

export const HIDEABLE_CARD_FIELD_OPTIONS = [
  { label: 'Address', value: 'address' },
  { label: 'Municipality', value: 'municipality' },
  { label: 'Phone', value: 'phone' },
];

export const DEFAULT_FIELD_SELECTION = [...ORAKEL_DEFAULT_FIELD_SELECTION];

const parseJson = (raw: string | undefined): unknown => {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const parseStringList = (raw: string | undefined): string[] | undefined => {
  const parsed = parseJson(raw);

  return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
    ? parsed
    : undefined;
};

export type OrakelSettings = {
  apiKey: string | undefined;
  baseUrl: string;
  fields: string[];
  hiddenCardFields: string[];
  contributeDomains: boolean;
};

export const readOrakelSettings = (env: Record<string, string | undefined>): OrakelSettings => {
  const apiKey = env.ORAKEL_API_KEY?.trim();
  const baseUrl = env.ORAKEL_BASE_URL?.trim() || DEFAULT_ORAKEL_BASE_URL;
  const contributeDomains = parseJson(env.ORAKEL_CONTRIBUTE_DOMAINS);

  return {
    apiKey: apiKey ? apiKey : undefined,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    fields: parseStringList(env.ORAKEL_FIELDS) ?? DEFAULT_FIELD_SELECTION,
    hiddenCardFields: parseStringList(env.ORAKEL_HIDDEN_CARD_FIELDS) ?? [],
    contributeDomains: typeof contributeDomains === 'boolean' ? contributeDomains : true,
  };
};
