import type { OrakelSettings } from 'src/catalog/settings';
import type { OrakelCompany, TenderExtra } from 'src/enrichment/orakel-values';

// The Orakel public API calls enrichment needs. Contract read on Orakel origin/main @ a1441e7a
// (observation, not a documented API):
//   GET  /api/companies/{org}?country=XX          profile, 404 if unknown
//   POST /api/companies/enrich {pairs}            up to 100 profiles, {data, notFound}
//   GET  /api/companies/match?name&domain         {candidates}, account-linked key (else 403)
//   GET  /api/companies/{org}/card                intelligence.activeTenders / latestTenderUrl
//   POST /api/companies/{org}/domain-contribution {domain}; 20 per account per 15 min (429)
// Every key check: 401 invalid key, 402 {code, upgradeUrl} trial over / unpaid,
// 429 {error: "Daily|Monthly quota exceeded"} quota, 429 otherwise per-minute rate limit.

export const MAX_ENRICH_BATCH = 100;
export const AUTO_WRITE_CONFIDENCE = 0.95;

// Org number formats by country (Orakel `lib/countries.ts`, checked in this order).
const ORG_NUMBER_FORMATS: [string, RegExp][] = [
  ['NO', /^\d{9}$/],
  ['FI', /^\d{7}-\d$/],
  ['SE', /^\d{10}$/],
  ['DK', /^\d{8}$/],
];

export const detectCountry = (orgNumber: string): string | null =>
  ORG_NUMBER_FORMATS.find(([, format]) => format.test(orgNumber))?.[0] ?? null;

// A failure that makes every further Orakel call pointless: the whole run stops with this status.
export class OrakelStopError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OrakelStopError';
  }
}

// One call failed; the run goes on with the next company.
export class OrakelRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OrakelRequestError';
  }
}

// The domain-contribution limit is used up. Refused calls still count against the account's
// quota, so the caller stops contributing for the rest of the run.
export class OrakelContributionLimitError extends Error {
  constructor() {
    super('Orakel domain contribution limit reached (20 per 15 minutes)');
    this.name = 'OrakelContributionLimitError';
  }
}

export type MatchCandidate = {
  orgNumber: string;
  name: string;
  confidence: number;
};

type FetchResponse = {
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
};

export type FetchLike = (
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponse>;

export type OrakelApiOptions = {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
};

const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 60_000;

const readBody = async (response: FetchResponse): Promise<Record<string, unknown>> => {
  try {
    const body = await response.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const stopFor = (status: number, body: Record<string, unknown>): OrakelStopError | null => {
  const upgrade = typeof body.upgradeUrl === 'string' ? ` Upgrade at ${body.upgradeUrl}.` : '';
  if (status === 401) {
    return new OrakelStopError(status, 'Orakel API key invalid: Orakel does not recognise the key. Paste a current key.');
  }
  if (status === 402) {
    return new OrakelStopError(
      status,
      body.code === 'trial_expired'
        ? `Orakel trial expired.${upgrade}`
        : `Orakel subscription inactive.${upgrade}`,
    );
  }
  if (status === 403) {
    return new OrakelStopError(status, 'Orakel needs an API key that belongs to an account. Create one at orakel.cloud under Account.');
  }
  if (status === 429 && typeof body.error === 'string' && /quota/i.test(body.error)) {
    return new OrakelStopError(status, `Orakel ${body.error.toLowerCase()}. Enrichment resumes when the quota resets.`);
  }
  return null;
};

export const createOrakelApi = (
  settings: Pick<OrakelSettings, 'apiKey' | 'baseUrl'>,
  options: OrakelApiOptions = {},
) => {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  if (!settings.apiKey) {
    throw new OrakelStopError(0, 'Orakel API key missing. Paste your key in the app settings; nothing is enriched until then.');
  }

  const call = async (
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    { retryOnRateLimit = true } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    for (let attempt = 0; ; attempt += 1) {
      let response: FetchResponse;
      try {
        response = await fetchImpl(`${settings.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${settings.apiKey}`,
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (error) {
        throw new OrakelRequestError(0, `${method} ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (response.status >= 200 && response.status < 300) {
        return { status: response.status, body: await readBody(response) };
      }

      const errorBody = await readBody(response);
      const stop = stopFor(response.status, errorBody);
      if (stop) throw stop;

      if (response.status === 429 && retryOnRateLimit && attempt < MAX_RATE_LIMIT_RETRIES) {
        const retryAfterSeconds = Number(response.headers.get('Retry-After'));
        const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 5_000 * 2 ** attempt;
        if (waitMs <= MAX_RETRY_AFTER_MS) {
          await sleep(waitMs);
          continue;
        }
      }

      return { status: response.status, body: errorBody };
    }
  };

  const fail = (path: string, result: { status: number; body: Record<string, unknown> }) =>
    new OrakelRequestError(
      result.status,
      `${path}: HTTP ${result.status}${typeof result.body.error === 'string' ? ` (${result.body.error})` : ''}`,
    );

  return {
    async getCompany(orgNumber: string): Promise<OrakelCompany | null> {
      const country = detectCountry(orgNumber) ?? 'NO';
      const path = `/api/companies/${encodeURIComponent(orgNumber)}?country=${country}`;
      const result = await call('GET', path);
      if (result.status === 404) return null;
      if (result.status >= 300) throw fail(path, result);
      return result.body as unknown as OrakelCompany;
    },

    // Profiles keyed by org number. Unknown org numbers are simply missing from the map.
    async enrichBatch(orgNumbers: string[]): Promise<Map<string, OrakelCompany>> {
      if (orgNumbers.length > MAX_ENRICH_BATCH) {
        throw new Error(`enrichBatch takes at most ${MAX_ENRICH_BATCH} org numbers`);
      }
      const found = new Map<string, OrakelCompany>();
      if (orgNumbers.length === 0) return found;
      const pairs = orgNumbers.map((orgNumber) => ({ orgNumber, country: detectCountry(orgNumber) ?? 'NO' }));
      const result = await call('POST', '/api/companies/enrich', { pairs });
      if (result.status >= 300) throw fail('/api/companies/enrich', result);
      const data = Array.isArray(result.body.data) ? (result.body.data as OrakelCompany[]) : [];
      for (const company of data) found.set(company.orgNumber, company);
      return found;
    },

    async match(name: string, domain: string | null): Promise<MatchCandidate[]> {
      const query = new URLSearchParams({ name });
      if (domain) query.set('domain', domain);
      const path = `/api/companies/match?${query.toString()}`;
      const result = await call('GET', path);
      if (result.status >= 300) throw fail('/api/companies/match', result);
      return Array.isArray(result.body.candidates) ? (result.body.candidates as MatchCandidate[]) : [];
    },

    async getTenders(orgNumber: string): Promise<TenderExtra> {
      const path = `/api/companies/${encodeURIComponent(orgNumber)}/card`;
      const result = await call('GET', path);
      if (result.status === 404) return {};
      if (result.status >= 300) throw fail(path, result);
      const intelligence = (result.body.intelligence ?? {}) as TenderExtra;
      return { activeTenders: intelligence.activeTenders, latestTenderUrl: intelligence.latestTenderUrl };
    },

    // Queued for human review in Orakel; never applied directly.
    async contributeDomain(orgNumber: string, domain: string): Promise<boolean> {
      const path = `/api/companies/${encodeURIComponent(orgNumber)}/domain-contribution`;
      const result = await call('POST', path, { domain }, { retryOnRateLimit: false });
      if (result.status === 429) throw new OrakelContributionLimitError();
      if (result.status >= 300) throw fail(path, result);
      return result.body.queued === true;
    },
  };
};

export type OrakelApi = ReturnType<typeof createOrakelApi>;
