import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';
import { STANDARD_OBJECT } from 'twenty-sdk/define';

import { orakelFieldName } from 'src/catalog/company-fields';
import type { TwentyCompanyRecord } from 'src/enrichment/company-patch';

// Twenty calls made by the enrichment functions, as the app (its own token, which may write the
// `orakel*` fields). Twenty allows 100 requests per 60 s per workspace, so calls are spaced at
// least `minIntervalMs` apart and a 429 is retried with backoff.

export const TWENTY_PAGE_SIZE = 100;
const DEFAULT_MIN_INTERVAL_MS = 700;
const MAX_RETRIES = 4;

type RestLike = Pick<RestApiClient, 'get' | 'patch'>;

export type TwentyApiOptions = {
  client?: RestLike;
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type CompanyPage = { records: TwentyCompanyRecord[]; nextCursor: string | null };

const describeError = (error: unknown) => {
  if (error instanceof RestApiClientError) {
    const body = error.body === undefined ? '' : ` ${JSON.stringify(error.body).slice(0, 300)}`;
    return `HTTP ${error.status ?? '?'}${body}`;
  }
  return error instanceof Error ? error.message : String(error);
};

export const createTwentyApi = (options: TwentyApiOptions = {}) => {
  const client = options.client ?? new RestApiClient({ runAs: 'application' });
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  let lastCallAt = -Infinity;

  const paced = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      const wait = lastCallAt + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      lastCallAt = now();
      try {
        return await run();
      } catch (error) {
        if (error instanceof RestApiClientError && error.status === 429 && attempt < MAX_RETRIES) {
          await sleep(5_000 * 2 ** attempt);
          continue;
        }
        throw new Error(`${label}: ${describeError(error)}`);
      }
    }
  };

  const listCompanies = async (
    cursor: string | null,
    filter?: string,
  ): Promise<CompanyPage> => {
    const response = await paced('list companies', () =>
      client.get<{
        data?: { companies?: TwentyCompanyRecord[] };
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      }>('/rest/companies', {
        query: { limit: TWENTY_PAGE_SIZE, depth: 0, starting_after: cursor ?? undefined, filter },
      }),
    );
    const records = response?.data?.companies ?? [];
    const pageInfo = response?.pageInfo;
    return {
      records,
      nextCursor: pageInfo?.hasNextPage && pageInfo.endCursor ? pageInfo.endCursor : null,
    };
  };

  return {
    listCompanies,

    async findCompaniesByOrgNumber(orgNumber: string): Promise<TwentyCompanyRecord[]> {
      const page = await listCompanies(null, `${orakelFieldName('orgNumber')}[eq]:${JSON.stringify(orgNumber)}`);
      return page.records;
    },

    async updateCompany(id: string, patch: Record<string, unknown>): Promise<void> {
      await paced(`update company ${id}`, () => client.patch(`/rest/companies/${id}`, patch));
    },
  };
};

export type TwentyApi = ReturnType<typeof createTwentyApi>;

// Whether this workspace's Company has the built-in `employees` field. Fresh 2.42 workspaces don't;
// older ones may (ORA-114). Asked once per run through the metadata API. If that call fails, the
// keys of a full Company record (a database event's `after`, or a REST record) answer instead.
export const companyHasField = async (
  fieldName: string,
  fallbackRecord: Record<string, unknown> | undefined,
  metadataClient: Pick<MetadataApiClient, 'query'> = new MetadataApiClient({ runAs: 'application' }),
): Promise<boolean> => {
  try {
    const { objects } = await metadataClient.query({
      objects: {
        __args: {
          paging: { first: 1 },
          filter: { universalIdentifier: { eq: STANDARD_OBJECT.company.universalIdentifier } },
        },
        edges: { node: { fieldsList: { name: true, isActive: true } } },
      },
    });
    const fields = objects.edges[0]?.node.fieldsList;
    if (!fields) throw new Error('Company object not found in metadata');
    return fields.some((field) => field.name === fieldName && field.isActive);
  } catch (error) {
    const hasField = fallbackRecord !== undefined && fieldName in fallbackRecord;
    console.warn(
      `[orakel] metadata check for Company.${fieldName} failed (${describeError(error)}); using the record's keys: ${hasField}`,
    );
    return hasField;
  }
};
