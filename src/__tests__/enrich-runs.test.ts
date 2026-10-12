import { describe, expect, it, vi } from 'vitest';

import { buildConflictSet, buttonState, runEnrichAll, weeklyState } from 'src/enrichment/enrich-all';
import { companiesToEnrich, runOnChange, type CompanyEvent } from 'src/enrichment/on-change';
import { OrakelStopError, type OrakelApi } from 'src/enrichment/orakel-api';
import type { TwentyCompanyRecord } from 'src/enrichment/company-patch';

import { orakelCompany, twentyCompany } from './enrichment-fixtures';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const env = { ORAKEL_API_KEY: 'orakel_test', ORAKEL_FIELDS: '["companyName","revenue"]', ORAKEL_CONTRIBUTE_DOMAINS: 'false' };

const fakeOrakel = (overrides: Partial<OrakelApi> = {}): OrakelApi => ({
  getCompany: vi.fn(async (org: string) => orakelCompany({ orgNumber: org })),
  enrichBatch: vi.fn(async (orgs: string[]) => new Map(orgs.map((org) => [org, orakelCompany({ orgNumber: org })]))),
  match: vi.fn(async () => []),
  getTenders: vi.fn(async () => ({})),
  contributeDomain: vi.fn(async () => true),
  ...overrides,
});

const updated = (after: Record<string, unknown>, updatedFields: string[], before: Record<string, unknown> = {}): CompanyEvent => ({
  recordId: String(after.id),
  properties: { after, before, updatedFields },
});

describe('enrich-on-change: which events lead to a write', () => {
  it('takes new companies and user changes to the org number or domain', () => {
    const created: CompanyEvent = { recordId: 'a', properties: { after: { id: 'a', name: 'A' } } };
    const domainChanged = updated({ id: 'b' }, ['domainName']);

    expect(companiesToEnrich([created, domainChanged]).map((record) => record.id)).toEqual(['a', 'b']);
  });

  it("ignores the app's own write (it also changed an app-only orakel* field): no loop", () => {
    const ownWrite = updated({ id: 'a', orakelOrgNumber: '923609016' }, ['orakelOrgNumber', 'orakelCompanyName', 'domainName']);

    expect(companiesToEnrich([ownWrite])).toEqual([]);
  });

  it('does not match straight back a number the user just removed', () => {
    const cleared = updated({ id: 'a', orakelOrgNumber: '' }, ['orakelOrgNumber'], { orakelOrgNumber: '923609016' });

    expect(companiesToEnrich([cleared])).toEqual([]);
  });

  it('handles each company once per batch, with its latest state', () => {
    const events = [
      updated({ id: 'a', orakelOrgNumber: '111111111' }, ['orakelOrgNumber']),
      updated({ id: 'a', orakelOrgNumber: '923609016' }, ['orakelOrgNumber']),
    ];

    expect(companiesToEnrich(events)).toEqual([{ id: 'a', orakelOrgNumber: '923609016' }]);
  });

  it('enriches the batch and writes as the app', async () => {
    const twenty = { updateCompany: vi.fn(async () => {}), findCompaniesByOrgNumber: vi.fn(async () => []) };
    const summary = await runOnChange([updated(twentyCompany({ orakelOrgNumber: '923609016' }), ['orakelOrgNumber'])], {
      env,
      orakel: fakeOrakel(),
      twenty,
      hasEmployeesField: async () => false,
    });

    expect(summary.totals.enriched).toBe(1);
    expect(twenty.updateCompany).toHaveBeenCalledWith(
      twentyCompany().id,
      expect.objectContaining({ orakelCompanyName: 'Heiberg Industries AS', orakelRevenue: 1_000_000 }),
    );
  });

  it('stops the batch with a clear status on 402, counting what was left', async () => {
    const orakel = fakeOrakel({
      getCompany: vi.fn(async () => {
        throw new OrakelStopError(402, 'Orakel trial expired. Upgrade at https://orakel.cloud/activate.');
      }),
    });
    const events = ['a', 'b', 'c'].map((id) => updated(twentyCompany({ id, orakelOrgNumber: '923609016' }), ['orakelOrgNumber']));
    const summary = await runOnChange(events, {
      env,
      orakel,
      twenty: { updateCompany: vi.fn(async () => {}), findCompaniesByOrgNumber: vi.fn(async () => []) },
      hasEmployeesField: async () => false,
    });

    expect(summary.stopped).toContain('trial expired');
    expect(summary.totals.notAttempted).toBe(3);
    expect(orakel.getCompany).toHaveBeenCalledTimes(1);
  });

  it('does nothing without an API key, and says so', async () => {
    const summary = await runOnChange([updated(twentyCompany(), ['domainName'])], { env: {} });

    expect(summary.stopped).toMatch(/API key missing/);
  });
});

describe('enrich-all', () => {
  const companies = (count: number, overrides: (index: number) => Partial<TwentyCompanyRecord> = () => ({})) =>
    Array.from({ length: count }, (_, index) =>
      twentyCompany({ id: `id-${String(index).padStart(4, '0')}`, orakelOrgNumber: String(900000000 + index), ...overrides(index) }),
    );

  const fakeTwenty = (records: TwentyCompanyRecord[]) => ({
    listCompanies: vi.fn(async (cursor: string | null) => {
      const start = cursor ? Number(cursor) : 0;
      return { records: records.slice(start, start + 100), nextCursor: start + 100 < records.length ? String(start + 100) : null };
    }),
    updateCompany: vi.fn(async () => {}),
  });

  it('sends Orakel batches of at most 100 and writes every company', async () => {
    const orakel = fakeOrakel();
    const twenty = fakeTwenty(companies(250));
    const summary = await runEnrichAll(buttonState(null), {
      env, now: () => 0, enqueue: vi.fn(), orakel, twenty, hasEmployeesField: async () => false,
    });

    const batchSizes = vi.mocked(orakel.enrichBatch).mock.calls.map(([orgs]) => orgs.length);
    expect(batchSizes).toEqual([100, 100, 50]);
    expect(orakel.getCompany).not.toHaveBeenCalled();
    expect(summary.totals.enriched).toBe(250);
  });

  it('with sinceDate, leaves companies Orakel has not updated since', async () => {
    const orakel = fakeOrakel({
      enrichBatch: vi.fn(async (orgs: string[]) =>
        new Map(orgs.map((org, index) => [org, orakelCompany({ orgNumber: org, updatedAt: index === 0 ? '2026-10-10T00:00:00Z' : '2026-01-01T00:00:00Z' })])),
      ),
    });
    const twenty = fakeTwenty(companies(3));
    const summary = await runEnrichAll(buttonState('2026-10-01T00:00:00.000Z'), {
      env, now: () => 0, enqueue: vi.fn(), orakel, twenty, hasEmployeesField: async () => false,
    });

    expect(twenty.updateCompany).toHaveBeenCalledTimes(1);
    expect(summary.totals).toMatchObject({ enriched: 1, unchanged: 2 });
  });

  it('the weekly run does not re-match unmatched companies; the button run does', async () => {
    const records = companies(2, (index) => (index === 1 ? { orakelOrgNumber: null } : {}));

    const weeklyOrakel = fakeOrakel();
    const weekly = await runEnrichAll(weeklyState(Date.parse('2026-10-12T00:00:00Z')), {
      env, now: () => 0, enqueue: vi.fn(), orakel: weeklyOrakel, twenty: fakeTwenty(records), hasEmployeesField: async () => false,
    });
    expect(weeklyOrakel.match).not.toHaveBeenCalled();
    expect(weekly.totals.notAttempted).toBe(1);

    const buttonOrakel = fakeOrakel();
    await runEnrichAll(buttonState(null), {
      env, now: () => 0, enqueue: vi.fn(), orakel: buttonOrakel, twenty: fakeTwenty(records), hasEmployeesField: async () => false,
    });
    expect(buttonOrakel.match).toHaveBeenCalledTimes(1);
  });

  it('hands the rest on as a background job when time is up, carrying the counts', async () => {
    let clock = 0;
    const enqueue = vi.fn(async () => {});
    const twenty = fakeTwenty(companies(250));
    twenty.updateCompany.mockImplementation(async () => {
      clock += 10_000;
    });
    const summary = await runEnrichAll(buttonState(null), {
      env, now: () => clock, enqueue, orakel: fakeOrakel(), twenty, hasEmployeesField: async () => false,
    });

    expect(summary.totals.enriched).toBe(100);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ afterId: 'id-0099', part: 2, totals: expect.objectContaining({ enriched: 100 }) }));
  });

  it('a continuation starts after the last company done', async () => {
    const orakel = fakeOrakel();
    await runEnrichAll({ ...buttonState(null), afterId: 'id-0099', part: 2 }, {
      env, now: () => 0, enqueue: vi.fn(), orakel, twenty: fakeTwenty(companies(150)), hasEmployeesField: async () => false,
    });

    expect(vi.mocked(orakel.enrichBatch).mock.calls[0][0][0]).toBe('900000100');
  });

  it('stops at 402 / quota with a clear status and counts the rest as not attempted', async () => {
    const orakel = fakeOrakel({
      enrichBatch: vi.fn(async () => {
        throw new OrakelStopError(429, 'Orakel monthly quota exceeded. Enrichment resumes when the quota resets.');
      }),
    });
    const summary = await runEnrichAll(buttonState(null), {
      env, now: () => 0, enqueue: vi.fn(), orakel, twenty: fakeTwenty(companies(250)), hasEmployeesField: async () => false,
    });

    expect(summary.stopped).toMatch(/quota/);
    expect(summary.totals.notAttempted).toBe(250);
    expect(orakel.enrichBatch).toHaveBeenCalledTimes(1);
  });

  it('builds the conflict set from org numbers with several different domains', () => {
    const conflicts = buildConflictSet([
      twentyCompany({ id: '1', orakelOrgNumber: '923609016', domainName: { primaryLinkUrl: 'https://heiberg.co' } }),
      twentyCompany({ id: '2', orakelOrgNumber: '923609016', domainName: { primaryLinkUrl: 'https://www.heiberg.no' } }),
      twentyCompany({ id: '3', orakelOrgNumber: '987654321', domainName: { primaryLinkUrl: 'https://a.no' } }),
      twentyCompany({ id: '4', orakelOrgNumber: '987654321', domainName: { primaryLinkUrl: 'http://www.a.no/' } }),
    ]);

    expect([...conflicts]).toEqual(['923609016']);
  });
});
