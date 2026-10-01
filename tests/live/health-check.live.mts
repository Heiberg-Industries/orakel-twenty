// Live sweep for the health check against the real Orakel API. Not part of `yarn test`.
//
//   ORAKEL_API_KEY=orakel_… [ORAKEL_EXPIRED_TRIAL_KEY=orakel_…] [ORAKEL_BASE_URL=…] \
//     npx tsx tests/live/health-check.live.mts
//
// Checks each state against what Orakel actually returns. Last run 2026-10-01 against orakel.cloud
// with a throwaway free key: valid → OK, bogus → "invalid", missing → "missing". The expired-trial
// state needs a key on an account whose trial has ended; pass it as ORAKEL_EXPIRED_TRIAL_KEY.

import { checkOrakelKey } from '../../src/catalog/orakel-key-status';

const baseUrl = (process.env.ORAKEL_BASE_URL ?? 'https://orakel.cloud').replace(/\/+$/, '');

const cases: { name: string; apiKey: string | undefined; expectTitle?: string; expectOk?: boolean }[] = [
  { name: 'missing key', apiKey: undefined, expectTitle: 'Orakel API key missing' },
  { name: 'bogus key', apiKey: 'orakel_bogus_live_sweep', expectTitle: 'Orakel API key invalid' },
];
if (process.env.ORAKEL_API_KEY) {
  cases.push({ name: 'valid key', apiKey: process.env.ORAKEL_API_KEY, expectOk: true });
}
if (process.env.ORAKEL_EXPIRED_TRIAL_KEY) {
  cases.push({ name: 'expired trial', apiKey: process.env.ORAKEL_EXPIRED_TRIAL_KEY, expectTitle: 'Orakel trial expired' });
}

let failed = 0;
for (const testCase of cases) {
  const result = await checkOrakelKey({ apiKey: testCase.apiKey, baseUrl });
  const pass = testCase.expectOk
    ? result.status === 'OK'
    : 'title' in result && result.title === testCase.expectTitle;
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${testCase.name}: ${JSON.stringify(result)}`);
}
if (!process.env.ORAKEL_API_KEY) console.log('SKIP  valid key: set ORAKEL_API_KEY');
if (!process.env.ORAKEL_EXPIRED_TRIAL_KEY) console.log('SKIP  expired trial: set ORAKEL_EXPIRED_TRIAL_KEY');
process.exit(failed ? 1 : 0);
