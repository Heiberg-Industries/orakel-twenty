import type { OrakelSettings } from 'src/catalog/settings';

// The one way logic functions talk to Orakel. The key never leaves the server: front components
// call the app's own routes, which call this.
//
// Orakel's key check (`requireApiKey`, plus `requireAccountKey` on the card, match and domain
// routes) answers, read from Orakel's source 2026-10-12 (observation, not a documented API):
//   401 {error: "Missing API key" | "Invalid API key"}
//   402 {error, code: "trial_expired" | "payment_required" | ..., upgradeUrl}
//   403 {error: "An account-linked API key is required for this endpoint"}
//   429 {error: "Too many requests..." | "Daily quota exceeded" | "Monthly quota exceeded", limit?}
// Every failure becomes one `OrakelFailure` kind, so the widget can show each as its own state.

export type OrakelFailure =
  | { kind: 'no-key' }
  | { kind: 'invalid-key' }
  | { kind: 'no-account' }
  | { kind: 'payment-required'; trialExpired: boolean; upgradeUrl: string }
  | { kind: 'not-found' }
  | { kind: 'forbidden'; message: string }
  | { kind: 'bad-request'; message: string }
  | { kind: 'rate-limited'; message: string }
  | { kind: 'unreachable'; message: string }
  | { kind: 'unexpected'; status: number; message: string };

export type OrakelResult<T> = { ok: true; data: T } | ({ ok: false } & OrakelFailure);

export type OrakelFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

type RequestOptions = {
  method?: 'GET' | 'POST';
  query?: Record<string, string | undefined>;
  body?: unknown;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;

const readBody = async (response: { json: () => Promise<unknown> }) => {
  try {
    const body = await response.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const errorText = (body: Record<string, unknown>, fallback: string) =>
  typeof body.error === 'string' && body.error.trim() !== '' ? body.error : fallback;

// Only an http(s) link from Orakel is shown as the upgrade link; anything else falls back to
// Orakel's own activation page.
export const safeUpgradeUrl = (raw: unknown, baseUrl: string) => {
  if (typeof raw === 'string') {
    try {
      const url = new URL(raw);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return url.toString();
      }
    } catch {
      // fall through
    }
  }
  return `${baseUrl}/activate`;
};

export const failureFromResponse = async (
  status: number,
  response: { json: () => Promise<unknown> },
  baseUrl: string,
): Promise<OrakelFailure> => {
  const body = await readBody(response);

  switch (status) {
    case 400:
      return { kind: 'bad-request', message: errorText(body, 'Orakel did not accept the request.') };
    case 401:
      return { kind: 'invalid-key' };
    case 402:
      return {
        kind: 'payment-required',
        trialExpired: body.code === 'trial_expired',
        upgradeUrl: safeUpgradeUrl(body.upgradeUrl, baseUrl),
      };
    case 403: {
      const message = errorText(body, 'Orakel refused the request.');
      return /account-linked/i.test(message) ? { kind: 'no-account' } : { kind: 'forbidden', message };
    }
    case 404:
      return { kind: 'not-found' };
    case 429:
      return { kind: 'rate-limited', message: errorText(body, 'Too many requests. Please try again later.') };
    default:
      return {
        kind: 'unexpected',
        status,
        message: errorText(body, `Orakel answered HTTP ${status}.`),
      };
  }
};

export const callOrakel = async <T>(
  settings: Pick<OrakelSettings, 'apiKey' | 'baseUrl'>,
  path: string,
  options: RequestOptions = {},
  fetchImpl: OrakelFetch = fetch,
): Promise<OrakelResult<T>> => {
  if (!settings.apiKey) {
    return { ok: false, kind: 'no-key' };
  }

  const url = new URL(`${settings.baseUrl}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.apiKey}`,
    Accept: 'application/json',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Awaited<ReturnType<OrakelFetch>>;
  try {
    response = await fetchImpl(url.toString(), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      kind: 'unreachable',
      message: `${settings.baseUrl} did not answer (${error instanceof Error ? error.message : String(error)}).`,
    };
  }

  if (response.status >= 200 && response.status < 300) {
    try {
      return { ok: true, data: (await response.json()) as T };
    } catch {
      return { ok: false, kind: 'unexpected', status: response.status, message: 'Orakel sent an unreadable answer.' };
    }
  }

  return { ok: false, ...(await failureFromResponse(response.status, response, settings.baseUrl)) };
};
