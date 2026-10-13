// Live acceptance sweep (spec §6): every logic function against a real Twenty with the app installed and the real
// Orakel. Not part of `yarn test`: it creates and deletes records, and Orakel bills every call.
//
//   ORAKEL_API_KEY=orakel_…  TWENTY_URL=http://localhost:3000  TWENTY_API_KEY=…  yarn tsx tests/live/app.live.mts
//
// Use a throwaway Twenty (SETUP.md), never a customer workspace. The app must be installed there with the same
// ORAKEL_API_KEY in its settings and the default field selection.
//
// Optional:
//   ORAKEL_BASE_URL            default https://orakel.cloud
//   ORAKEL_REVOKED_KEY         a key you created and then revoked in Orakel (else a made-up key stands in)
//   ORAKEL_EXPIRED_TRIAL_KEY   a key on an account whose trial has ended
//   TWENTY_ROUTE_TOKEN         a logged-in person's access token for the widget routes (spec §9: API-key calls carry
//                              no user). Default: TWENTY_API_KEY.
//   SWEEP_NO_WEBSITE_ORG       a Norwegian org number Orakel knows no website for: checks "No website"
//   SWEEP_WORKSPACE_KEY_STATE  `revoked` or `expired-trial`: you put that kind of key in the app's settings; the sweep
//                              then checks the health check and the widget in the workspace, and nothing else
//   SWEEP_KEEP=1               leave the test companies and people in the workspace
//
// Part A asks Orakel directly, with the app's own code. Part B works through Twenty: it creates the companies in
// `app.fixtures.mts`, lets enrich-on-create run, then calls every route. Both directions are checked: a wrong or
// ambiguous match is never written (too eager), a real one is at least suggested (too strict).
//
// Exit code 0 only when nothing failed. SKIP rows mean the run is not a full acceptance run.

import { checkOrakelKey } from '../../src/catalog/orakel-key-status';
import { orakelFieldName } from '../../src/catalog/company-fields';
import { readOrakelSettings } from '../../src/catalog/settings';
import {
  ADD_PERSON_FUNCTION_UNIVERSAL_IDENTIFIER,
  CARD_FUNCTION_UNIVERSAL_IDENTIFIER,
  CONTACTS_FUNCTION_UNIVERSAL_IDENTIFIER,
  ENRICH_ALL_UNIVERSAL_IDENTIFIER,
  ENRICH_ON_CHANGE_UNIVERSAL_IDENTIFIER,
  ENRICH_ON_CREATE_UNIVERSAL_IDENTIFIER,
  FINANCIAL_HISTORY_FUNCTION_UNIVERSAL_IDENTIFIER,
  HEALTH_CHECK_UNIVERSAL_IDENTIFIER,
  REFRESH_FUNCTION_UNIVERSAL_IDENTIFIER,
  RESOLVE_DOMAIN_FUNCTION_UNIVERSAL_IDENTIFIER,
  SET_ORG_NUMBER_FUNCTION_UNIVERSAL_IDENTIFIER,
} from '../../src/constants/universal-identifiers';
import { DEFAULT_FIELD_SELECTION } from '../../src/catalog/settings';
import { buttonState } from '../../src/enrichment/enrich-all';
import { buildEnrichmentValues } from '../../src/enrichment/orakel-values';
import { AUTO_WRITE_CONFIDENCE, createOrakelApi, type MatchCandidate } from '../../src/enrichment/orakel-api';
import { describeSummary, type RunSummary } from '../../src/enrichment/run';
import type { AddPersonResult, CardState } from '../../src/widget/card-types';
import { loadCardState } from '../../src/widget/load-card';
import { extractCreatedId } from '../../src/widget/people';
import { MATCH_FIXTURES, ROUTE_FIXTURE_KEY, USE_THIS_FIXTURE_KEY } from './app.fixtures.mts';

// ── Results ──────────────────────────────────────────────────────────────────────────────────────

type Status = 'PASS' | 'FAIL' | 'SKIP';
const rows: { status: Status; name: string }[] = [];

const row = (status: Status, name: string, detail = '') => {
  rows.push({ status, name });
  console.log(`${status}  ${name}${detail ? `: ${detail}` : ''}`);
};
const check = (pass: boolean, name: string, detail = '') => row(pass ? 'PASS' : 'FAIL', name, detail);
const short = (value: unknown) => JSON.stringify(value)?.slice(0, 400) ?? String(value);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ── Settings ─────────────────────────────────────────────────────────────────────────────────────

const env = process.env;
const orakelSettings = readOrakelSettings(env);
const TWENTY_URL = env.TWENTY_URL?.replace(/\/+$/, '');
const TWENTY_API_KEY = env.TWENTY_API_KEY;
const ROUTE_TOKEN = env.TWENTY_ROUTE_TOKEN || TWENTY_API_KEY;
const KEY_STATE = env.SWEEP_WORKSPACE_KEY_STATE;
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const ORG_FIELD = orakelFieldName('orgNumber');
const OWN_FIELDS = new Set([ORG_FIELD, orakelFieldName('doNotEnrich')]);

const AUTO_MATCH_TIMEOUT_MS = 120_000;
const NO_MATCH_SETTLE_MS = 60_000;
const LOOP_GUARD_WAIT_MS = 20_000;

// The app's rule (enrich-company.ts step 3): written only when exactly one candidate reaches 0.95.
const autoWritePick = (candidates: MatchCandidate[]) => {
  const confident = candidates.filter((candidate) => candidate.confidence >= AUTO_WRITE_CONFIDENCE);
  return confident.length === 1 ? confident[0].orgNumber : null;
};
const describeCandidates = (candidates: { orgNumber: string; name: string; confidence: number }[]) =>
  candidates.length === 0
    ? 'no candidates'
    : candidates.map((c) => `${c.orgNumber} ${c.name} ${c.confidence}`).join(' | ');

// ── Part A: Orakel, directly ─────────────────────────────────────────────────────────────────────

const predicted = new Map<string, string | null>();

const partA = async () => {
  console.log(`\n# Part A: Orakel at ${orakelSettings.baseUrl}, with the app's code\n`);
  const { baseUrl } = orakelSettings;

  const healthCases: { name: string; apiKey: string | undefined; expect: string }[] = [
    { name: 'missing key', apiKey: undefined, expect: 'Orakel API key missing' },
    { name: 'made-up key', apiKey: `orakel_sweep_bogus_${RUN_ID}`, expect: 'Orakel API key invalid' },
  ];
  if (orakelSettings.apiKey) healthCases.push({ name: 'valid key', apiKey: orakelSettings.apiKey, expect: 'OK' });
  if (env.ORAKEL_REVOKED_KEY) {
    healthCases.push({ name: 'revoked key', apiKey: env.ORAKEL_REVOKED_KEY, expect: 'Orakel API key invalid' });
  }
  if (env.ORAKEL_EXPIRED_TRIAL_KEY) {
    healthCases.push({ name: 'expired trial', apiKey: env.ORAKEL_EXPIRED_TRIAL_KEY, expect: 'Orakel trial expired' });
  }
  for (const testCase of healthCases) {
    const result = await checkOrakelKey({ apiKey: testCase.apiKey, baseUrl });
    const got = result.status === 'OK' ? 'OK' : result.title;
    check(got === testCase.expect && (got === 'OK' || result.status === 'ERROR'), `A health check, ${testCase.name}`, short(result));
  }
  if (!env.ORAKEL_REVOKED_KEY) row('SKIP', 'A health check, revoked key', 'set ORAKEL_REVOKED_KEY (the made-up key covers the same 401)');
  if (!env.ORAKEL_EXPIRED_TRIAL_KEY) row('SKIP', 'A health check, expired trial', 'set ORAKEL_EXPIRED_TRIAL_KEY');

  // The card state for a bad key: an upgrade or key message, never a blank widget.
  const cardCompany = { id: 'sweep', name: 'Equinor ASA', domain: null, orgNumber: '923609016', doNotEnrich: false };
  const revokedKey = env.ORAKEL_REVOKED_KEY ?? `orakel_sweep_bogus_${RUN_ID}`;
  const revokedState = await loadCardState(cardCompany, { ...orakelSettings, apiKey: revokedKey });
  check(
    revokedState.state === 'key-problem' && revokedState.reason === 'invalid-key',
    `A card, ${env.ORAKEL_REVOKED_KEY ? 'revoked' : 'made-up'} key shows the key problem`,
    short(revokedState),
  );
  if (env.ORAKEL_EXPIRED_TRIAL_KEY) {
    const state = await loadCardState(cardCompany, { ...orakelSettings, apiKey: env.ORAKEL_EXPIRED_TRIAL_KEY });
    check(
      state.state === 'payment-required' && state.trialExpired && /^https?:\/\//.test(state.upgradeUrl),
      'A card, expired trial shows the upgrade state',
      short(state),
    );
  } else {
    row('SKIP', 'A card, expired trial shows the upgrade state', 'set ORAKEL_EXPIRED_TRIAL_KEY');
  }

  if (!orakelSettings.apiKey) {
    row('SKIP', 'A match fixtures', 'set ORAKEL_API_KEY');
    return;
  }

  // Matching, both directions, with the domain exactly as enrichment sends it.
  const orakel = createOrakelApi(orakelSettings);
  for (const fixture of MATCH_FIXTURES) {
    let candidates: MatchCandidate[];
    try {
      candidates = await orakel.match(fixture.name, fixture.domain);
    } catch (error) {
      check(false, `A match ${fixture.key}`, error instanceof Error ? error.message : String(error));
      continue;
    }
    const pick = autoWritePick(candidates);
    predicted.set(fixture.key, pick);
    const seen = `"${fixture.name}" ${fixture.domain ?? '(no website)'} → ${describeCandidates(candidates)}`;

    const eagerOk = fixture.autoWrite === 'never' ? pick === null : pick === null || pick === fixture.expectOrg;
    check(eagerOk, `A too eager, ${fixture.key}: ${fixture.why}`, `${seen}; auto-write would pick ${pick ?? 'nothing'}`);
    if (fixture.expectOrg) {
      check(
        candidates.some((candidate) => candidate.orgNumber === fixture.expectOrg),
        `A too strict, ${fixture.key}: ${fixture.expectOrg} is suggested`,
        seen,
      );
    }
  }
};

// ── Twenty calls ─────────────────────────────────────────────────────────────────────────────────

type Reply = { status: number; body: any };

const twenty = async (method: string, path: string, body?: unknown, token = TWENTY_API_KEY): Promise<Reply> => {
  // Twenty allows 100 requests per 60 s per workspace; a 429 waits and tries again.
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${TWENTY_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(900_000),
    });
    const text = await response.text();
    if (response.status === 429 && attempt < 4) {
      await sleep(15_000);
      continue;
    }
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // keep the text
    }
    return { status: response.status, body: parsed };
  }
};

const route = (method: 'GET' | 'POST', path: string, body?: unknown) => twenty(method, `/s${path}`, body, ROUTE_TOKEN);

const metadata = async (query: string, variables: Record<string, unknown> = {}) => {
  const reply = await twenty('POST', '/metadata', { query, variables });
  if (reply.status >= 300 || reply.body?.errors) {
    throw new Error(`metadata: HTTP ${reply.status} ${short(reply.body?.errors ?? reply.body)}`);
  }
  return reply.body.data;
};

const functionIds = new Map<string, string>();

// Runs one of the app's logic functions inside the workspace, as `yarn twenty dev:function:exec` does. A failure
// comes back as `error`, so it shows as a failed row rather than ending the sweep.
const execFunction = async (
  universalIdentifier: string,
  payload: unknown,
): Promise<{ data?: any; status?: string; error?: unknown }> => {
  const id = functionIds.get(universalIdentifier);
  if (!id) return { error: `function ${universalIdentifier} is not installed` };
  try {
    const data = await metadata(
      `mutation Exec($input: ExecuteOneLogicFunctionInput!) {
         executeOneLogicFunction(input: $input) { data logs duration status error }
       }`,
      { input: { id, payload } },
    );
    return data.executeOneLogicFunction;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

type CompanyRow = Record<string, any> & { id: string };

const createCompany = async (fields: Record<string, unknown>) => {
  const reply = await twenty('POST', '/rest/companies', fields);
  const id = extractCreatedId(reply.body);
  if (reply.status >= 300 || !id) throw new Error(`create company: HTTP ${reply.status} ${short(reply.body)}`);
  return id;
};

// Throws unless every requested company came back: a read that failed must never look like "nothing written".
const readCompanies = async (ids: string[]): Promise<Map<string, CompanyRow>> => {
  const filter = `id[in]:[${ids.map((id) => JSON.stringify(id)).join(',')}]`;
  const reply = await twenty('GET', `/rest/companies?limit=60&depth=0&filter=${encodeURIComponent(filter)}`);
  const records: unknown = reply.body?.data?.companies;
  if (reply.status >= 300 || !Array.isArray(records)) {
    throw new Error(`read companies: HTTP ${reply.status} ${short(reply.body)}`);
  }
  const byId = new Map((records as CompanyRow[]).map((record) => [record.id, record]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`read companies: Twenty did not return ${missing.join(', ')}`);
  return byId;
};

const readCompany = async (id: string) => (await readCompanies([id])).get(id)!;

const orgOf = (record: CompanyRow | undefined) => {
  if (!record) throw new Error('company record missing');
  return String(record[ORG_FIELD] ?? '').trim();
};

// Any `orakel*` field the app writes, filled: the fields came in, not only the org number.
const filledAppFields = (record: CompanyRow | undefined) =>
  Object.entries(record ?? {})
    .filter(([key, value]) => key.startsWith('orakel') && !OWN_FIELDS.has(key) && value !== null && value !== '')
    .map(([key]) => key);

// Every selected field holds exactly what Orakel has for this company. The sweep assumes the default field
// selection (README); the two tender fields are not in it. Without ORAKEL_API_KEY there is nothing to compare to.
const checkFieldValues = async (name: string, record: CompanyRow) => {
  if (!orakelSettings.apiKey) {
    row('SKIP', name, 'set ORAKEL_API_KEY to compare the values with Orakel');
    return;
  }
  const company = await createOrakelApi(orakelSettings).getCompany(orgOf(record));
  if (!company) {
    check(false, name, `Orakel does not know ${orgOf(record)}`);
    return;
  }
  const expected = buildEnrichmentValues(company, DEFAULT_FIELD_SELECTION);
  const wrong = Object.entries(expected)
    .filter(([slug, value]) => {
      const actual = record[orakelFieldName(slug)];
      return typeof value === 'number' ? Number(actual) !== value : actual !== value;
    })
    .map(([slug, value]) => `${slug}: Twenty ${short(record[orakelFieldName(slug)])}, Orakel ${short(value)}`);
  check(
    Object.keys(expected).length > 0 && wrong.length === 0,
    name,
    wrong.length ? wrong.join('; ') : `${Object.keys(expected).join(', ')} match Orakel`,
  );
};

const waitFor = async <T,>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await sleep(5_000);
    value = await read();
  }
  return value;
};

const created = { companies: [] as string[], people: [] as string[], notes: [] as string[] };

const deleteRecord = async (object: 'companies' | 'people' | 'notes', id: string) => {
  const reply = await twenty('DELETE', `/rest/${object}/${id}`);
  if (reply.status >= 300) console.log(`      could not delete ${object} ${id}: HTTP ${reply.status}`);
};

const cleanup = async () => {
  if (env.SWEEP_KEEP === '1') {
    console.log(`\nKept: companies ${created.companies.join(', ')}; people ${created.people.join(', ')}`);
    return;
  }
  for (const id of created.notes) await deleteRecord('notes', id);
  for (const id of created.people) await deleteRecord('people', id);
  for (const id of created.companies) await deleteRecord('companies', id);
  console.log(`\nCleaned up ${created.companies.length} companies, ${created.people.length} people, ${created.notes.length} notes.`);
};

// ── Part B: Twenty ───────────────────────────────────────────────────────────────────────────────

const APP_FUNCTIONS: [string, string][] = [
  ['health-check', HEALTH_CHECK_UNIVERSAL_IDENTIFIER],
  ['enrich-on-create', ENRICH_ON_CREATE_UNIVERSAL_IDENTIFIER],
  ['enrich-on-change', ENRICH_ON_CHANGE_UNIVERSAL_IDENTIFIER],
  ['enrich-all', ENRICH_ALL_UNIVERSAL_IDENTIFIER],
  ['card', CARD_FUNCTION_UNIVERSAL_IDENTIFIER],
  ['set-org-number', SET_ORG_NUMBER_FUNCTION_UNIVERSAL_IDENTIFIER],
  ['refresh', REFRESH_FUNCTION_UNIVERSAL_IDENTIFIER],
  ['financial-history', FINANCIAL_HISTORY_FUNCTION_UNIVERSAL_IDENTIFIER],
  ['resolve-domain', RESOLVE_DOMAIN_FUNCTION_UNIVERSAL_IDENTIFIER],
  ['contacts', CONTACTS_FUNCTION_UNIVERSAL_IDENTIFIER],
  ['add-person', ADD_PERSON_FUNCTION_UNIVERSAL_IDENTIFIER],
];

const preflight = async () => {
  const data = await metadata('query { findManyLogicFunctions { id name universalIdentifier } }');
  for (const fn of data.findManyLogicFunctions as { id: string; universalIdentifier: string }[]) {
    functionIds.set(fn.universalIdentifier, fn.id);
  }
  const missing = APP_FUNCTIONS.filter(([, uid]) => !functionIds.has(uid)).map(([name]) => name);
  check(missing.length === 0, 'B app installed with all 11 functions', missing.length ? `missing: ${missing.join(', ')}` : '');
  return missing.length === 0;
};

// The workspace holds a revoked or expired-trial key (SWEEP_WORKSPACE_KEY_STATE).
const keyStateSweep = async (state: string) => {
  const expectTitle = state === 'expired-trial' ? 'Orakel trial expired' : 'Orakel API key invalid';
  const health = await execFunction(HEALTH_CHECK_UNIVERSAL_IDENTIFIER, {});
  check(health.data?.status === 'ERROR' && health.data?.title === expectTitle, `B health check is red (${state})`, short(health.data ?? health.error));

  const id = await createCompany({ name: 'Equinor ASA', [ORG_FIELD]: '923609016' });
  created.companies.push(id);
  const card = await route('GET', `/orakel/card?companyId=${id}`);
  const cardState = card.body as CardState;
  check(
    card.status === 200 &&
      (state === 'expired-trial'
        ? cardState.state === 'payment-required' && cardState.trialExpired && /^https?:\/\//.test(cardState.upgradeUrl)
        : cardState.state === 'key-problem'),
    `B card shows the ${state === 'expired-trial' ? 'upgrade' : 'key problem'} state, not a blank widget`,
    `HTTP ${card.status} ${short(card.body)}`,
  );

  const refresh = await route('POST', '/orakel/refresh', { companyId: id });
  check(refresh.body?.ok === false && typeof refresh.body?.message === 'string', 'B refresh says why it cannot run', short(refresh.body));

  const enrichAll = await route('POST', '/enrich-all', {});
  check(enrichAll.body?.started === false && /Orakel/.test(enrichAll.body?.message ?? ''), 'B enrich all refuses to start', short(enrichAll.body));
};

const partB = async () => {
  console.log(`\n# Part B: Twenty at ${TWENTY_URL}, routes as ${env.TWENTY_ROUTE_TOKEN ? 'TWENTY_ROUTE_TOKEN' : 'the API key (no user)'}\n`);
  if (!(await preflight())) return;

  if (KEY_STATE) {
    await keyStateSweep(KEY_STATE);
    return;
  }

  const health = await execFunction(HEALTH_CHECK_UNIVERSAL_IDENTIFIER, {});
  check(health.data?.status === 'OK', 'B health check is green with the workspace key', short(health.data ?? health.error));

  // enrich-on-create: create each fixture, then wait for the app.
  const ids = new Map<string, string>();
  for (const fixture of MATCH_FIXTURES) {
    try {
      const id = await createCompany({
        name: fixture.name,
        ...(fixture.domain ? { domainName: { primaryLinkUrl: fixture.domain } } : {}),
      });
      ids.set(fixture.key, id);
      created.companies.push(id);
    } catch (error) {
      check(false, `B create ${fixture.key}`, `${error instanceof Error ? error.message : String(error)} (left over from an earlier run?)`);
    }
  }
  const createdAt = Date.now();
  const fixtureIds = [...ids.values()];
  const expectWritten = MATCH_FIXTURES.filter((fixture) => ids.has(fixture.key) && predicted.get(fixture.key));

  let records = await waitFor(
    () => readCompanies(fixtureIds),
    (current) => expectWritten.every((fixture) => orgOf(current.get(ids.get(fixture.key)!)) !== ''),
    AUTO_MATCH_TIMEOUT_MS,
  );
  // Unmatched companies have nothing to wait for: give the event batch time to have run.
  const settle = createdAt + NO_MATCH_SETTLE_MS - Date.now();
  if (settle > 0) await sleep(settle);
  records = await readCompanies(fixtureIds);
  const waited = Math.round((Date.now() - createdAt) / 1000);

  for (const fixture of MATCH_FIXTURES) {
    const id = ids.get(fixture.key);
    if (!id) continue;
    const written = orgOf(records.get(id));
    const expected = predicted.get(fixture.key);
    const allowed = fixture.autoWrite === 'never' ? written === '' : written === '' || written === fixture.expectOrg;
    check(allowed, `B too eager, enrich-on-create ${fixture.key}`, `wrote ${written || 'nothing'} (${waited} s)`);
    if (expected !== undefined) {
      check(
        written === (expected ?? ''),
        `B enrich-on-create ${fixture.key} does what Orakel's answer says`,
        `Orakel predicts ${expected ?? 'no write'}, Twenty has ${written || 'nothing'}`,
      );
    }
    if (written) {
      await checkFieldValues(`B enrich-on-create ${fixture.key} fills the selected fields with Orakel's values`, records.get(id)!);
    }
  }

  // card: ready for written companies, suggestions for the rest.
  for (const fixture of MATCH_FIXTURES) {
    const id = ids.get(fixture.key);
    if (!id) continue;
    const written = orgOf(records.get(id));
    const reply = await route('GET', `/orakel/card?companyId=${id}`);
    const state = reply.body as CardState;
    if (written) {
      check(
        state?.state === 'ready' && state.card.overview.orgNumber === written,
        `B card ${fixture.key} shows ${written}`,
        `HTTP ${reply.status} ${state?.state}`,
      );
    } else {
      const suggestions = state?.state === 'not-matched' ? state.suggestions : [];
      check(state?.state === 'not-matched', `B card ${fixture.key} shows suggestions, not a match`, `HTTP ${reply.status} ${state?.state} ${describeCandidates(suggestions)}`);
      if (fixture.expectOrg) {
        check(
          suggestions.some((suggestion) => suggestion.orgNumber === fixture.expectOrg),
          `B too strict, card ${fixture.key} suggests ${fixture.expectOrg}`,
          describeCandidates(suggestions),
        );
      }
    }
  }

  // "Use this" → set-org-number, then enrich-on-change fills the fields, once.
  const useThis = MATCH_FIXTURES.find((fixture) => fixture.key === USE_THIS_FIXTURE_KEY)!;
  const useThisId = ids.get(useThis.key);
  if (useThisId && useThis.expectOrg) {
    const bad = await route('POST', '/orakel/set-org-number', { companyId: useThisId, orgNumber: 'not a number' });
    check(bad.status === 400, 'B set-org-number refuses a non-number', `HTTP ${bad.status} ${short(bad.body)}`);

    const reply = await route('POST', '/orakel/set-org-number', { companyId: useThisId, orgNumber: useThis.expectOrg });
    check(reply.body?.ok === true, `B "Use this" sets ${useThis.expectOrg}`, `HTTP ${reply.status} ${short(reply.body)}`);
    // The fields are written in one update, so the first one filled means the write has landed.
    const after = await waitFor(() => readCompany(useThisId), (record) => filledAppFields(record).length > 0, AUTO_MATCH_TIMEOUT_MS);
    check(orgOf(after) === useThis.expectOrg, `B "Use this" keeps ${useThis.expectOrg}`, `has ${orgOf(after) || 'nothing'}`);
    await checkFieldValues('B enrich-on-change fills the fields after "Use this" with Orakel\'s values', after);
    // The app's own write must not trigger it again (docs/solutions/2026-10-12-enrich-on-change-loop-guard.md).
    await sleep(5_000);
    const before = (await readCompany(useThisId)).updatedAt;
    await sleep(LOOP_GUARD_WAIT_MS);
    const later = (await readCompany(useThisId)).updatedAt;
    const isTime = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
    check(
      isTime(before) && isTime(later) && before === later,
      'B enrich-on-change does not re-trigger itself',
      `updatedAt ${before} → ${later}`,
    );
  }

  // The widget's other routes, on one enriched Norwegian company.
  const routeFixture = MATCH_FIXTURES.find((fixture) => fixture.key === ROUTE_FIXTURE_KEY)!;
  const routeId = ids.get(routeFixture.key);
  if (routeId && routeFixture.expectOrg) {
    if (!orgOf(await readCompany(routeId))) {
      await route('POST', '/orakel/set-org-number', { companyId: routeId, orgNumber: routeFixture.expectOrg });
      await waitFor(() => readCompany(routeId), (record) => filledAppFields(record).length > 0, AUTO_MATCH_TIMEOUT_MS);
    }
    await routeChecks(routeId);
  } else {
    row('SKIP', 'B route checks', `${ROUTE_FIXTURE_KEY} was not created`);
  }

  if (env.SWEEP_NO_WEBSITE_ORG) {
    const id = await createCompany({ name: `Sweep no website ${RUN_ID}`, [ORG_FIELD]: env.SWEEP_NO_WEBSITE_ORG });
    created.companies.push(id);
    const reply = await route('POST', '/orakel/contacts', { companyId: id });
    check(reply.body?.ok === true && reply.body.contacts?.noWebsite === true, 'B Find contacts says "No website"', short(reply.body));
  } else {
    row('SKIP', 'B Find contacts says "No website"', 'set SWEEP_NO_WEBSITE_ORG');
  }

  // enrich-all: the button's validation, the run itself (synchronous here), the weekly run, then the button.
  const badDate = await route('POST', '/enrich-all', { sinceDate: 'not a date' });
  check(badDate.body?.started === false, 'B enrich all refuses a bad sinceDate', short(badDate.body));

  const button = await execFunction(ENRICH_ALL_UNIVERSAL_IDENTIFIER, { enrichAll: buttonState(null) });
  const buttonSummary = button.data as RunSummary | undefined;
  check(
    !!buttonSummary?.totals && !buttonSummary.stopped && buttonSummary.totals.failed === 0,
    'B enrich all runs through without failures or rate-limit stops',
    buttonSummary?.totals ? describeSummary(buttonSummary) : short(button.error ?? button.data),
  );
  const afterAll = await readCompanies(fixtureIds);
  for (const fixture of MATCH_FIXTURES.filter((candidate) => candidate.autoWrite === 'never' && candidate.key !== USE_THIS_FIXTURE_KEY)) {
    const id = ids.get(fixture.key);
    if (id) check(orgOf(afterAll.get(id)) === '', `B too eager, enrich all ${fixture.key}`, `has ${orgOf(afterAll.get(id)) || 'nothing'}`);
  }

  const weekly = await execFunction(ENRICH_ALL_UNIVERSAL_IDENTIFIER, {});
  const weeklySummary = weekly.data as RunSummary | undefined;
  check(
    !!weeklySummary?.totals && !weeklySummary.stopped && weeklySummary.totals.failed === 0,
    'B weekly run (cron payload) runs through',
    weeklySummary?.totals ? describeSummary(weeklySummary) : short(weekly.error ?? weekly.data),
  );

  // Last, because it queues a background run over the whole workspace.
  const started = await route('POST', '/enrich-all', {});
  check(started.body?.started === true, 'B "Enrich all companies" button starts a run', short(started.body));
};

const notesOf = async (personId: string) => {
  const filter = `targetPersonId[eq]:${JSON.stringify(personId)}`;
  const reply = await twenty('GET', `/rest/noteTargets?depth=1&filter=${encodeURIComponent(filter)}`);
  return ((reply.body?.data?.noteTargets ?? []) as { noteId?: string; note?: { id?: string; title?: string } }[]).map(
    (target) => ({ id: target.note?.id ?? target.noteId ?? '', title: target.note?.title ?? '' }),
  );
};

const routeChecks = async (companyId: string) => {
  const refresh = await route('POST', '/orakel/refresh', { companyId });
  check(
    refresh.body?.ok === true && ['enriched', 'unchanged'].includes(refresh.body?.outcome),
    'B refresh re-enriches',
    `HTTP ${refresh.status} ${short(refresh.body)}`,
  );

  const card = await route('GET', `/orakel/card?companyId=${companyId}`);
  const state = card.body as CardState;
  if (state?.state !== 'ready') {
    check(false, 'B card is ready for the route checks', `HTTP ${card.status} ${short(card.body)}`);
    return;
  }
  const { intelligence } = state.card;
  console.log(`      card: CEO ${intelligence.ceo ?? '-'}, chair ${intelligence.boardChair ?? '-'}, ${intelligence.boardMembers.length} board members, ${state.card.financials.length} years`);

  const history = await route('POST', '/orakel/financial-history', { companyId });
  check(history.body?.ok === true, 'B financial-history reads the 5-year accounts', `HTTP ${history.status} ${short(history.body)}`);

  const domain = await route('POST', '/orakel/resolve-domain', { companyId });
  // `ok` alone is also the answer when nothing was sent (sharing off): only `queued` proves it went to Orakel.
  if (domain.body?.ok === true && domain.body.skipped === 'sharing-off') {
    row('SKIP', 'B resolve-domain sends the website for review', 'website sharing is off in the app settings');
  } else {
    check(
      domain.body?.ok === true && domain.body.queued === true,
      'B resolve-domain sends the website for review',
      `HTTP ${domain.status} ${short(domain.body)}`,
    );
  }

  const contacts = await route('POST', '/orakel/contacts', { companyId });
  const found = contacts.body?.contacts;
  check(
    contacts.body?.ok === true && (found?.emails?.length > 0 || found?.phones?.length > 0),
    'B Find contacts lists addresses from the website',
    `HTTP ${contacts.status} ${short(contacts.body)}`,
  );

  const addPerson = async (body: Record<string, unknown>) => {
    const reply = await route('POST', '/orakel/add-person', { companyId, ...body });
    const result = reply.body as AddPersonResult;
    if (result?.ok) created.people.push(result.personId);
    return { reply, result };
  };

  const listedName = intelligence.ceo ?? intelligence.boardChair;
  if (listedName) {
    const first = await addPerson({ name: listedName });
    check(first.result?.ok === true && !first.result.noteError, `B + Add creates ${listedName}`, short(first.reply.body));
    if (first.result?.ok) {
      const notes = await notesOf(first.result.personId);
      created.notes.push(...notes.map((note) => note.id).filter(Boolean));
      check(notes.some((note) => note.title.startsWith('Added from Orakel: ')), 'B + Add leaves the "Added from Orakel" note', short(notes));
    }
    const again = await addPerson({ name: listedName });
    check(again.result?.ok === false && 'matchedBy' in again.result && again.result.matchedBy === 'name', 'B + Add again finds the duplicate by name', short(again.reply.body));
  } else {
    row('SKIP', 'B + Add by name', 'Orakel lists no CEO or board chair for this company');
  }

  // Someone Orakel doesn't list (as a suppressed person isn't): never created, whatever the widget sends.
  const unlisted = await addPerson({ name: `Sweep Unlisted ${RUN_ID}` });
  check(unlisted.result?.ok === false && 'message' in unlisted.result, 'B + Add refuses a person Orakel does not list', short(unlisted.reply.body));

  const email = `sweep-${RUN_ID}@example.com`;
  const byEmail = await addPerson({ email });
  check(byEmail.result?.ok === true, 'B + Add by email creates the person', short(byEmail.reply.body));
  if (byEmail.result?.ok) {
    created.notes.push(...(await notesOf(byEmail.result.personId)).map((note) => note.id).filter(Boolean));
  }
  const emailAgain = await addPerson({ email });
  check(
    emailAgain.result?.ok === false && 'matchedBy' in emailAgain.result && emailAgain.result.matchedBy === 'email',
    'B + Add by email again finds the duplicate',
    short(emailAgain.reply.body),
  );
};

// ── Run ──────────────────────────────────────────────────────────────────────────────────────────

try {
  await partA();
  if (TWENTY_URL && TWENTY_API_KEY) {
    try {
      await partB();
    } finally {
      await cleanup();
    }
  } else {
    row('SKIP', 'Part B (Twenty)', 'set TWENTY_URL and TWENTY_API_KEY');
  }
} catch (error) {
  row('FAIL', 'sweep aborted', error instanceof Error ? error.stack ?? error.message : String(error));
}

const count = (status: Status) => rows.filter((result) => result.status === status).length;
console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped${count('SKIP') ? ' (not a full acceptance run)' : ''}.`);
process.exit(count('FAIL') ? 1 : 0);
