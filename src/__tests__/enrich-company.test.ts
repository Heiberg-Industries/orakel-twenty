import { describe, expect, it, vi } from 'vitest';

import { enrichCompany, type EnrichDeps, type EnrichRunContext } from 'src/enrichment/enrich-company';
import {
  OrakelContributionLimitError,
  OrakelRequestError,
  OrakelStopError,
} from 'src/enrichment/orakel-api';

import { orakelCompany, twentyCompany } from './enrichment-fixtures';

const setup = (overrides: Partial<EnrichDeps['orakel']> = {}) => {
  const calls: string[] = [];
  const orakel = {
    getCompany: vi.fn(async (org: string) => {
      calls.push(`fetch ${org}`);
      return orakelCompany({ orgNumber: org, primaryDomain: 'orakel-domain.no' });
    }),
    match: vi.fn(async () => {
      calls.push('match');
      return [{ orgNumber: '923609016', name: 'Heiberg Industries AS', confidence: 0.95 }];
    }),
    getTenders: vi.fn(async () => ({ activeTenders: 0, latestTenderUrl: null })),
    contributeDomain: vi.fn(async () => {
      calls.push('contribute');
      return true;
    }),
    ...overrides,
  };
  const deps: EnrichDeps = {
    orakel,
    updateCompany: vi.fn(async () => {
      calls.push('write');
    }),
    isDomainConflicted: vi.fn(async () => false),
    log: () => {},
  };
  const context: EnrichRunContext = {
    selectedSlugs: ['companyName', 'revenue'],
    hasEmployeesField: false,
    contributeDomains: true,
    contributionsAllowed: true,
  };
  return { calls, orakel, deps, context };
};

describe('enrichCompany: decision order (spec §2.1)', () => {
  it('1. stops at "do not enrich" before any call', async () => {
    const { calls, deps, context } = setup();
    const result = await enrichCompany(twentyCompany({ orakelDoNotEnrich: true, orakelOrgNumber: '923609016' }), deps, context);

    expect(result.outcome).toBe('skipped-do-not-enrich');
    expect(calls).toEqual([]);
  });

  it('2. with an org number: fetch, write, then contribute the domain — no match call', async () => {
    const { calls, deps, context } = setup();
    const result = await enrichCompany(twentyCompany({ orakelOrgNumber: '923609016' }), deps, context);

    expect(result).toMatchObject({ outcome: 'enriched', orgNumber: '923609016', contributed: true });
    expect(calls).toEqual(['fetch 923609016', 'write', 'contribute']);
    expect(deps.orakel.contributeDomain).toHaveBeenCalledWith('923609016', 'heiberg.co');
  });

  it('3. without an org number: match, and write the single ≥0.95 candidate with its fields in one write', async () => {
    const { calls, deps, context } = setup();
    const result = await enrichCompany(twentyCompany(), deps, context);

    expect(result.outcome).toBe('enriched');
    expect(calls).toEqual(['match', 'fetch 923609016', 'write', 'contribute']);
    expect(deps.updateCompany).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ orakelOrgNumber: '923609016', orakelCompanyName: 'Heiberg Industries AS' }),
    );
  });

  it.each([
    ['below 0.95', [{ orgNumber: '923609016', name: 'X', confidence: 0.85 }]],
    ['several at 0.95', [
      { orgNumber: '923609016', name: 'X', confidence: 0.95 },
      { orgNumber: '987654321', name: 'Y', confidence: 0.95 },
    ]],
    ['no candidates', []],
  ])('3. writes nothing for a match %s', async (_label, candidates) => {
    const { calls, deps, context } = setup({ match: vi.fn(async () => candidates) });
    const result = await enrichCompany(twentyCompany(), deps, context);

    expect(result.outcome).toBe('no-match');
    expect(calls).toEqual([]);
  });

  it('reports a company Orakel does not know, without writing', async () => {
    const { deps, context } = setup({ getCompany: vi.fn(async () => null) });
    const result = await enrichCompany(twentyCompany({ orakelOrgNumber: '923609016' }), deps, context);

    expect(result.outcome).toBe('not-found');
    expect(deps.updateCompany).not.toHaveBeenCalled();
  });

  it('uses a batch-fetched profile instead of fetching again', async () => {
    const { calls, deps, context } = setup();
    await enrichCompany(twentyCompany({ orakelOrgNumber: '923609016' }), deps, context, orakelCompany());

    expect(calls).not.toContain('fetch 923609016');
  });

  it('rejects a malformed org number without calling Orakel', async () => {
    const { calls, deps, context } = setup();
    const result = await enrichCompany(twentyCompany({ orakelOrgNumber: '12' }), deps, context);

    expect(result.outcome).toBe('failed');
    expect(calls).toEqual([]);
  });

  describe('failures', () => {
    it('surfaces a refused Twenty write as failed, and contributes nothing', async () => {
      const { deps, context } = setup();
      deps.updateCompany = vi.fn(async () => {
        throw new Error('update company: HTTP 400');
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await enrichCompany(twentyCompany({ orakelOrgNumber: '923609016' }), deps, context);

      expect(result).toMatchObject({ outcome: 'failed', error: expect.stringContaining('HTTP 400') });
      expect(deps.orakel.contributeDomain).not.toHaveBeenCalled();
    });

    it('counts an Orakel error on one company as failed', async () => {
      const { deps, context } = setup({
        getCompany: vi.fn(async () => {
          throw new OrakelRequestError(502, 'HTTP 502');
        }),
      });
      const result = await enrichCompany(twentyCompany({ orakelOrgNumber: '923609016' }), deps, context);

      expect(result.outcome).toBe('failed');
    });

    it('lets a stop (402 / quota) through so the run ends', async () => {
      const { deps, context } = setup({
        getCompany: vi.fn(async () => {
          throw new OrakelStopError(402, 'Orakel trial expired.');
        }),
      });

      await expect(enrichCompany(twentyCompany({ orakelOrgNumber: '923609016' }), deps, context)).rejects.toThrow(
        'Orakel trial expired.',
      );
    });
  });

  describe('domain contribution', () => {
    it('is skipped when sharing is off', async () => {
      const { deps, context } = setup();
      await enrichCompany(twentyCompany({ orakelOrgNumber: '923609016' }), deps, { ...context, contributeDomains: false });

      expect(deps.orakel.contributeDomain).not.toHaveBeenCalled();
    });

    it('is skipped for an org number in the conflict set', async () => {
      const { deps, context } = setup();
      deps.isDomainConflicted = vi.fn(async () => true);
      await enrichCompany(twentyCompany({ orakelOrgNumber: '923609016' }), deps, context);

      expect(deps.orakel.contributeDomain).not.toHaveBeenCalled();
    });

    it('is skipped when Orakel already has this domain', async () => {
      const { deps, context } = setup({ getCompany: vi.fn(async () => orakelCompany({ primaryDomain: 'www.heiberg.co' })) });
      await enrichCompany(twentyCompany({ orakelOrgNumber: '923609016' }), deps, context);

      expect(deps.orakel.contributeDomain).not.toHaveBeenCalled();
    });

    it('is skipped outside Norway (the route takes Norwegian org numbers only)', async () => {
      const { deps, context } = setup();
      await enrichCompany(twentyCompany({ orakelOrgNumber: '5560000001' }), deps, context);

      expect(deps.orakel.contributeDomain).not.toHaveBeenCalled();
    });

    it('turns itself off for the rest of the run at the limit, without failing the company', async () => {
      const { deps, context } = setup({
        contributeDomain: vi.fn(async () => {
          throw new OrakelContributionLimitError();
        }),
      });
      const result = await enrichCompany(twentyCompany({ orakelOrgNumber: '923609016' }), deps, context);

      expect(result.outcome).toBe('enriched');
      expect(context.contributionsAllowed).toBe(false);
    });
  });
});
