import type { ApplicationHealthCheckResult } from 'twenty-sdk/define';

import type { OrakelSettings } from 'src/catalog/settings';

// What Orakel says about a key, as the app's settings page should show it.
//
// Probe: `GET /api/keys/usage`. It runs Orakel's full key check (`requireApiKey`) and is not
// billed or logged as usage. Contract read from orakel `lib/auth.ts` @ 62943358 (observation,
// not a documented API):
//   401 {error: "Missing API key" | "Invalid API key"}         unknown, revoked or expired-OAuth key
//   402 {error, code: "trial_expired" | <other>, upgradeUrl}   trial over / payment access missing
//   429                                                        rate or quota limit (key itself is valid)
// If Orakel adds another 4xx for keys, it lands in the generic "unexpected answer" banner below
// rather than silently showing green.

const VARIABLES_TAB = '#variables';

type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

const readBody = async (response: { json: () => Promise<unknown> }) => {
  try {
    const body = await response.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export const checkOrakelKey = async (
  settings: Pick<OrakelSettings, 'apiKey' | 'baseUrl'>,
  fetchImpl: FetchLike = fetch,
): Promise<ApplicationHealthCheckResult> => {
  if (!settings.apiKey) {
    return {
      status: 'ERROR',
      title: 'Orakel API key missing',
      description: 'Paste your Orakel API key in the Orakel API key setting. Nothing is enriched until then.',
      action: { label: 'Add key', location: VARIABLES_TAB },
    };
  }

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(`${settings.baseUrl}/api/keys/usage`, {
      headers: { Authorization: `Bearer ${settings.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return {
      status: 'WARNING',
      title: 'Orakel could not be reached',
      description: `${settings.baseUrl} did not answer (${error instanceof Error ? error.message : String(error)}). Check the Orakel URL setting.`,
      action: { label: 'Check URL', location: VARIABLES_TAB },
    };
  }

  if (response.status >= 200 && response.status < 300) {
    return { status: 'OK' };
  }

  if (response.status === 401) {
    return {
      status: 'ERROR',
      title: 'Orakel API key invalid',
      description: 'Orakel does not recognise this key. It may have been revoked or rotated. Paste a current key.',
      action: { label: 'Replace key', location: VARIABLES_TAB },
    };
  }

  if (response.status === 402) {
    const body = await readBody(response);
    const upgradeUrl = typeof body.upgradeUrl === 'string' ? ` Upgrade at ${body.upgradeUrl}.` : '';

    if (body.code === 'trial_expired') {
      return {
        status: 'ERROR',
        title: 'Orakel trial expired',
        description: `The key is valid, but the Orakel trial has ended.${upgradeUrl}`,
      };
    }

    return {
      status: 'ERROR',
      title: 'Orakel subscription inactive',
      description: `The key is valid, but the Orakel account has no active subscription.${upgradeUrl}`,
    };
  }

  if (response.status === 429) {
    return {
      status: 'WARNING',
      title: 'Orakel usage limit reached',
      description: 'The key works, but it has hit its rate or quota limit. Enrichment resumes when the limit resets.',
    };
  }

  return {
    status: 'WARNING',
    title: 'Unexpected answer from Orakel',
    description: `Checking the key returned HTTP ${response.status}. Try again later.`,
  };
};
