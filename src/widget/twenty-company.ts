import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';

import { orakelFieldName } from 'src/catalog/company-fields';

// Reads and writes the one Company the widget is showing, through Twenty's REST API.
//
// The default client acts as the person who clicked in the widget (their role intersected with the
// app's), so a person can only read, or set the org number on, a company they could edit by hand.

export type TwentyCompany = {
  id: string;
  name: string | null;
  domain: string | null;
  orgNumber: string | null;
  doNotEnrich: boolean;
};

type TwentyRestClient = Pick<RestApiClient, 'get' | 'patch'>;

const ORG_NUMBER_FIELD = orakelFieldName('orgNumber');
const DO_NOT_ENRICH_FIELD = orakelFieldName('doNotEnrich');

export const parseCompany = (id: string, record: Record<string, unknown>): TwentyCompany => {
  const domainName = record.domainName as { primaryLinkUrl?: unknown } | null | undefined;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

  return {
    id,
    name: text(record.name),
    domain: text(domainName?.primaryLinkUrl),
    orgNumber: text(record[ORG_NUMBER_FIELD]),
    doNotEnrich: record[DO_NOT_ENRICH_FIELD] === true,
  };
};

export class CompanyAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CompanyAccessError';
  }
}

const accessError = (error: unknown, action: string) => {
  if (error instanceof RestApiClientError && (error.status === 403 || error.status === 404)) {
    return new CompanyAccessError(`You can't ${action} this company, or it no longer exists.`, error.status);
  }
  return new CompanyAccessError(
    `Could not ${action} this company (${error instanceof Error ? error.message : String(error)}).`,
    502,
  );
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isRecordId = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

// The full record. Twenty answers `GET /rest/companies/{id}` with `{ data: { company: {...} } }`.
export const readCompanyRecord = async (
  companyId: string,
  client: TwentyRestClient = new RestApiClient(),
): Promise<Record<string, unknown> & { id: string }> => {
  let body: unknown;
  try {
    body = await client.get(`/rest/companies/${companyId}`);
  } catch (error) {
    throw accessError(error, 'read');
  }
  const data = (body as { data?: { company?: unknown } } | null)?.data;
  const record = (data?.company ?? data ?? body ?? {}) as Record<string, unknown>;

  return { ...record, id: companyId };
};

export const readCompany = async (
  companyId: string,
  client: TwentyRestClient = new RestApiClient(),
): Promise<TwentyCompany> => parseCompany(companyId, await readCompanyRecord(companyId, client));

export const writeOrgNumber = async (
  companyId: string,
  orgNumber: string,
  client: TwentyRestClient = new RestApiClient(),
) => {
  try {
    await client.patch(`/rest/companies/${companyId}`, { [ORG_NUMBER_FIELD]: orgNumber });
  } catch (error) {
    throw accessError(error, 'update');
  }
};
