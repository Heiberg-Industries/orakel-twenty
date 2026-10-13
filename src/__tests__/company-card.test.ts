import { describe, expect, it, vi } from 'vitest';

import type { OrakelSettings } from 'src/catalog/settings';
import type { OrakelCompanyCard } from 'src/widget/card-types';
import { fetchFinancialHistory, proposeCrmDomain } from 'src/widget/card-actions';
import { addressLine, financialColumns, formatMillions, foundingYear, websiteView } from 'src/widget/format';
import { loadCardState } from 'src/widget/load-card';
import { callOrakel, type OrakelFetch } from 'src/widget/orakel-client';
import { cleanOrgNumber } from 'src/widget/org-number';
import { refreshCompany } from 'src/widget/refresh';
import { parseCompany, type TwentyCompany } from 'src/widget/twenty-company';

import { orakelCompany, twentyCompany } from './enrichment-fixtures';

// The Company widget's server side (ORA-119). Orakel's answers follow its routes on origin/main
// @ a1441e7a (read from the code, not recorded).

const settings = (overrides: Partial<OrakelSettings> = {}): OrakelSettings => ({
  apiKey: 'orakel_test',
  baseUrl: 'https://orakel.test',
  fields: ['companyName', 'revenue'],
  hiddenCardFields: [],
  contributeDomains: true,
  ...overrides,
});

const company = (overrides: Partial<TwentyCompany> = {}): TwentyCompany => ({
  id: '0b5c6a40-3c8e-4a8e-9a43-7d1c2a7a0f11',
  name: 'Heiberg Industries',
  domain: 'https://www.heiberg.co/about',
  orgNumber: '923609016',
  doNotEnrich: false,
  ...overrides,
});

const card = (overview: Partial<OrakelCompanyCard['overview']> = {}): OrakelCompanyCard => ({
  overview: {
    orgNumber: '923609016',
    companyName: 'Heiberg Industries AS',
    orgFormCode: 'AS',
    orgFormDescription: 'Aksjeselskap',
    naceCode: '62.020',
    naceDescription: 'Konsulentvirksomhet',
    foundingDate: '2019-05-02',
    employeeCount: 12,
    street: 'Storgata 1',
    zip: '0155',
    city: 'OSLO',
    municipality: 'Oslo',
    domain: 'heiberg.co',
    country: 'NO',
    phone: null,
    description: null,
    isBankrupt: false,
    isBeingDissolved: false,
    ...overview,
  },
  financials: [],
  pdfYearCount: 1,
  intelligence: {
    ceo: null,
    boardChair: null,
    boardMembers: [],
    activeTenders: 0,
    latestTenderUrl: null,
    latestTenderTitle: null,
    technologies: [],
  },
});

type Reply = { status: number; body?: unknown };

// A fake Orakel: answers each call with the next reply and records the URL and method.
const fakeOrakel = (...replies: Reply[]) => {
  const calls: { url: string; method: string; body?: string; auth?: string }[] = [];
  const fetchImpl: OrakelFetch = vi.fn(async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, auth: init.headers.Authorization });
    const reply = replies.shift() ?? { status: 500 };
    return { status: reply.status, json: async () => reply.body };
  });
  return { calls, fetchImpl };
};

describe('callOrakel: every Orakel failure becomes one kind', () => {
  it.each([
    [401, { error: 'Invalid API key' }, { kind: 'invalid-key' }],
    [403, { error: 'An account-linked API key is required for this endpoint' }, { kind: 'no-account' }],
    [403, { error: 'PDF financial history is not enabled for this key' }, { kind: 'forbidden' }],
    [404, { error: 'Company not found' }, { kind: 'not-found' }],
    [429, { error: 'Daily quota exceeded' }, { kind: 'rate-limited', message: 'Daily quota exceeded' }],
    [503, {}, { kind: 'unexpected', status: 503 }],
  ])('HTTP %i', async (status, body, expected) => {
    const { fetchImpl } = fakeOrakel({ status, body });
    expect(await callOrakel(settings(), '/api/x', {}, fetchImpl)).toMatchObject({ ok: false, ...expected });
  });

  it('402: trial expired, with an http(s) upgrade link only', async () => {
    const { fetchImpl } = fakeOrakel(
      { status: 402, body: { code: 'trial_expired', upgradeUrl: 'https://orakel.cloud/activate?x=1' } },
      { status: 402, body: { code: 'payment_required', upgradeUrl: 'javascript:alert(1)' } },
    );

    expect(await callOrakel(settings(), '/api/x', {}, fetchImpl)).toMatchObject({
      kind: 'payment-required',
      trialExpired: true,
      upgradeUrl: 'https://orakel.cloud/activate?x=1',
    });
    expect(await callOrakel(settings(), '/api/x', {}, fetchImpl)).toMatchObject({
      kind: 'payment-required',
      trialExpired: false,
      upgradeUrl: 'https://orakel.test/activate',
    });
  });

  it('no key: no call at all', async () => {
    const { calls, fetchImpl } = fakeOrakel();
    expect(await callOrakel(settings({ apiKey: undefined }), '/api/x', {}, fetchImpl)).toEqual({ ok: false, kind: 'no-key' });
    expect(calls).toEqual([]);
  });

  it('a network failure is "unreachable", not a crash', async () => {
    const fetchImpl: OrakelFetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect(await callOrakel(settings(), '/api/x', {}, fetchImpl)).toMatchObject({ ok: false, kind: 'unreachable' });
  });
});

describe('loadCardState: the widget states', () => {
  it('opted out and no key: no Orakel call', async () => {
    const { calls, fetchImpl } = fakeOrakel();
    expect(await loadCardState(company({ doNotEnrich: true }), settings(), fetchImpl)).toEqual({ state: 'opted-out' });
    expect(await loadCardState(company(), settings({ apiKey: undefined }), fetchImpl)).toEqual({ state: 'no-key' });
    expect(calls).toEqual([]);
  });

  it('matched: the card, with both websites as bare hosts for the conflict picker', async () => {
    const { calls, fetchImpl } = fakeOrakel({ status: 200, body: card({ domain: 'www.heiberg.no' }) });
    const state = await loadCardState(company(), settings({ hiddenCardFields: ['phone'] }), fetchImpl);

    expect(calls[0]).toMatchObject({ url: 'https://orakel.test/api/companies/923609016/card', method: 'GET', auth: 'Bearer orakel_test' });
    expect(state).toMatchObject({
      state: 'ready',
      hiddenCardFields: ['phone'],
      orakelDomain: 'heiberg.no',
      crmDomain: 'heiberg.co',
    });
  });

  it('an org number Orakel does not know: "not in Orakel"', async () => {
    const { fetchImpl } = fakeOrakel({ status: 404, body: { error: 'Company not found' } });
    expect(await loadCardState(company(), settings(), fetchImpl)).toEqual({ state: 'not-in-orakel', orgNumber: '923609016' });
  });

  it('402: the upgrade state', async () => {
    const { fetchImpl } = fakeOrakel({ status: 402, body: { code: 'trial_expired', upgradeUrl: 'https://orakel.cloud/activate' } });
    expect(await loadCardState(company(), settings(), fetchImpl)).toEqual({
      state: 'payment-required',
      trialExpired: true,
      upgradeUrl: 'https://orakel.cloud/activate',
    });
  });

  it('no org number: at most 3 suggestions, by name and domain, and nothing written', async () => {
    const candidates = [1, 2, 3, 4].map((n) => ({
      orgNumber: `92360901${n}`,
      name: `Heiberg ${n}`,
      city: 'OSLO',
      orgFormCode: 'AS',
      confidence: 0.99,
      matchedBy: 'name',
    }));
    const { calls, fetchImpl } = fakeOrakel({ status: 200, body: { candidates } });
    const state = await loadCardState(company({ orgNumber: null }), settings(), fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://orakel.test/api/companies/match?name=Heiberg+Industries&domain=heiberg.co');
    expect(state).toMatchObject({ state: 'not-matched', searchedName: 'Heiberg Industries' });
    expect(state.state === 'not-matched' && state.suggestions.map((s) => s.orgNumber)).toEqual([
      '923609011',
      '923609012',
      '923609013',
    ]);
  });

  it('no org number and no name: no match call', async () => {
    const { calls, fetchImpl } = fakeOrakel();
    expect(await loadCardState(company({ orgNumber: null, name: null }), settings(), fetchImpl)).toEqual({
      state: 'not-matched',
      suggestions: [],
      searchedName: null,
    });
    expect(calls).toEqual([]);
  });
});

describe('card actions', () => {
  it('financial history: one blocking POST, Norwegian companies only', async () => {
    const { calls, fetchImpl } = fakeOrakel({ status: 200, body: { syncResult: { years: [2021, 2022, 2023] } } });

    expect(await fetchFinancialHistory(company(), settings(), fetchImpl)).toEqual({ ok: true, extractedYears: 3 });
    expect(calls[0]).toMatchObject({ url: 'https://orakel.test/api/companies/923609016/financial-history', method: 'POST' });

    expect(await fetchFinancialHistory(company({ orgNumber: '5560000000' }), settings(), fetchImpl)).toMatchObject({ ok: false });
    expect(calls).toHaveLength(1);
  });

  it('financial history: Orakel refusing it is shown as written', async () => {
    const { fetchImpl } = fakeOrakel({ status: 403, body: { error: 'PDF financial history is not enabled for this key' } });
    expect(await fetchFinancialHistory(company(), settings(), fetchImpl)).toEqual({
      ok: false,
      message: 'PDF financial history is not enabled for this key',
    });
  });

  it("resolve-domain: proposes the company's own Twenty website, as a bare host", async () => {
    const { calls, fetchImpl } = fakeOrakel({ status: 200, body: { ok: true, queued: true } });

    expect(await proposeCrmDomain(company(), settings(), fetchImpl)).toEqual({ ok: true, queued: true });
    expect(calls[0]).toMatchObject({ url: 'https://orakel.test/api/companies/923609016/domain', method: 'POST' });
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({ domain: 'heiberg.co' });
  });

  it('resolve-domain: nothing sent when sharing is off or the company is not Norwegian', async () => {
    const { calls, fetchImpl } = fakeOrakel();

    expect(await proposeCrmDomain(company(), settings({ contributeDomains: false }), fetchImpl)).toEqual({
      ok: true,
      queued: false,
      skipped: 'sharing-off',
    });
    expect(await proposeCrmDomain(company({ orgNumber: '12345678' }), settings(), fetchImpl)).toEqual({
      ok: true,
      queued: false,
      skipped: 'not-norwegian',
    });
    expect(calls).toEqual([]);
  });
});

describe('"Use this": the org number accepted', () => {
  it.each([
    ['923 609 016', '923609016'],
    ['5560000000', '5560000000'],
    ['12345678', '12345678'],
    ['1234567-8', '1234567-8'],
    ['92360901', '92360901'],
  ])('%s → %s', (raw, expected) => {
    expect(cleanOrgNumber(raw)).toBe(expected);
  });

  it.each([['abc'], ['9236090161234'], [''], [42], [null]])('rejects %s', (raw) => {
    expect(cleanOrgNumber(raw)).toBeNull();
  });
});

describe('Refresh: re-enriches one company', () => {
  const deps = (overrides: Record<string, unknown> = {}) => ({
    env: { ORAKEL_API_KEY: 'orakel_test', ORAKEL_FIELDS: JSON.stringify(['companyName']) },
    orakel: {
      getCompany: vi.fn(async () => orakelCompany()),
      enrichBatch: vi.fn(),
      match: vi.fn(async () => []),
      getTenders: vi.fn(async () => ({})),
      contributeDomain: vi.fn(async () => false),
    },
    twenty: { updateCompany: vi.fn(async () => {}), findCompaniesByOrgNumber: vi.fn(async () => []) },
    hasEmployeesField: async () => false,
    ...overrides,
  });

  it('writes the selected fields and says so', async () => {
    const d = deps();
    const result = await refreshCompany(twentyCompany({ orakelOrgNumber: '923609016' }), d);

    expect(result).toMatchObject({ ok: true, outcome: 'enriched' });
    expect(d.twenty.updateCompany).toHaveBeenCalledWith(
      '0b5c6a40-3c8e-4a8e-9a43-7d1c2a7a0f11',
      expect.objectContaining({ orakelCompanyName: 'Heiberg Industries AS' }),
    );
  });

  it('"Do not enrich": no Orakel call, no write', async () => {
    const d = deps();
    const result = await refreshCompany(twentyCompany({ orakelOrgNumber: '923609016', orakelDoNotEnrich: true }), d);

    expect(result).toMatchObject({ ok: true, outcome: 'skipped-do-not-enrich' });
    expect(d.orakel.getCompany).not.toHaveBeenCalled();
    expect(d.twenty.updateCompany).not.toHaveBeenCalled();
  });

  it('no key: a clear message instead of a crash', async () => {
    const result = await refreshCompany(twentyCompany(), { env: {} });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/key missing/i);
  });
});

describe('reading the company', () => {
  it('takes name, website, org number and "do not enrich" from the REST record', () => {
    expect(
      parseCompany('id-1', {
        name: ' Heiberg ',
        domainName: { primaryLinkUrl: 'https://heiberg.co' },
        orakelOrgNumber: '923609016',
        orakelDoNotEnrich: true,
      }),
    ).toEqual({ id: 'id-1', name: 'Heiberg', domain: 'https://heiberg.co', orgNumber: '923609016', doNotEnrich: true });
  });
});

describe('display helpers (ported from the HubSpot card)', () => {
  it('formats amounts in millions', () => {
    expect(formatMillions(1_234_567)).toBe('1.2M');
    expect(formatMillions(45_600_000)).toBe('46M');
    expect(formatMillions(3_400_000_000)).toBe('3.4B');
    expect(formatMillions(-2_000_000)).toBe('-2.0M');
    expect(formatMillions(null)).toBe('—');
  });

  it('founding year and address', () => {
    expect(foundingYear('2019-05-02')).toBe('2019');
    expect(foundingYear(null)).toBeNull();
    expect(addressLine(card().overview)).toBe('Storgata 1, 0155 OSLO');
    expect(addressLine(card({ street: null, zip: null, city: null }).overview)).toBeNull();
  });

  it('shows Revenue and Equity columns only when a year has them', () => {
    const year = { year: 2025, revenue: null, operatingResult: 1, netResult: 1, totalAssets: 1, totalEquity: null };
    expect(financialColumns([year]).map((column) => column.key)).toEqual(['operatingResult', 'netResult', 'totalAssets']);
    expect(financialColumns([{ ...year, revenue: 5, totalEquity: 2 }]).map((column) => column.key)).toEqual([
      'revenue',
      'operatingResult',
      'netResult',
      'totalAssets',
      'totalEquity',
    ]);
  });

  it('website conflict: offered only while two different websites are unpicked', () => {
    expect(websiteView('heiberg.no', 'heiberg.co', null)).toEqual({
      displayDomain: 'heiberg.no',
      conflict: { orakelDomain: 'heiberg.no', crmDomain: 'heiberg.co' },
    });
    expect(websiteView('heiberg.no', 'heiberg.co', 'heiberg.co')).toEqual({ displayDomain: 'heiberg.co', conflict: null });
    expect(websiteView('heiberg.co', 'heiberg.co', null).conflict).toBeNull();
    expect(websiteView(null, 'heiberg.co', null)).toEqual({ displayDomain: 'heiberg.co', conflict: null });
  });
});
