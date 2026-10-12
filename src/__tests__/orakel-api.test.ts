import { describe, expect, it, vi } from 'vitest';

import {
  createOrakelApi,
  OrakelContributionLimitError,
  OrakelStopError,
  type FetchLike,
} from 'src/enrichment/orakel-api';

// Response bodies are shaped from Orakel's requireApiKey and routes (origin/main @ a1441e7a).
const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => ({
  status,
  headers: { get: (name: string) => headers[name] ?? null },
  json: async () => body,
});

const settings = { apiKey: 'orakel_test', baseUrl: 'https://orakel.cloud' };
const noSleep = { sleep: async () => {} };

describe('Orakel API client', () => {
  it('refuses to start without a key', () => {
    expect(() => createOrakelApi({ ...settings, apiKey: undefined })).toThrow(OrakelStopError);
  });

  it('stops the run on 402 with the upgrade link', async () => {
    const api = createOrakelApi(settings, {
      fetchImpl: vi.fn(async () => reply(402, { code: 'trial_expired', upgradeUrl: 'https://orakel.cloud/activate' })) as FetchLike,
    });

    await expect(api.getCompany('923609016')).rejects.toThrow(/trial expired.*orakel\.cloud\/activate/);
  });

  it('stops the run when the quota is used up', async () => {
    const api = createOrakelApi(settings, {
      fetchImpl: vi.fn(async () => reply(429, { error: 'Daily quota exceeded', limit: 100 }, { 'Retry-After': '86400' })) as FetchLike,
    });

    await expect(api.enrichBatch(['923609016'])).rejects.toBeInstanceOf(OrakelStopError);
  });

  it('waits out a short per-minute rate limit and retries', async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply(429, { error: 'Too many requests. Please try again later.' }, { 'Retry-After': '7' }))
      .mockResolvedValueOnce(reply(200, { orgNumber: '923609016' }));
    const api = createOrakelApi(settings, { fetchImpl: fetchImpl as FetchLike, sleep });

    expect(await api.getCompany('923609016')).toEqual({ orgNumber: '923609016' });
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('returns null for an unknown company and asks for the right country', async () => {
    const fetchImpl = vi.fn(async () => reply(404, { error: 'Company 5560000001 not found' }));
    const api = createOrakelApi(settings, { fetchImpl: fetchImpl as FetchLike, ...noSleep });

    expect(await api.getCompany('5560000001')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith('https://orakel.cloud/api/companies/5560000001?country=SE', expect.anything());
  });

  it('sends a batch as pairs and keys the answer by org number', async () => {
    const fetchImpl = vi.fn(async () => reply(200, { data: [{ orgNumber: '923609016' }], notFound: [] }));
    const api = createOrakelApi(settings, { fetchImpl: fetchImpl as FetchLike, ...noSleep });
    const found = await api.enrichBatch(['923609016', '987654321']);

    expect([...found.keys()]).toEqual(['923609016']);
    expect(JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toEqual({
      pairs: [
        { orgNumber: '923609016', country: 'NO' },
        { orgNumber: '987654321', country: 'NO' },
      ],
    });
  });

  it('does not retry a domain contribution at the limit (refused calls still count)', async () => {
    const fetchImpl = vi.fn(async () => reply(429, { error: 'Too many requests. Please try again later.' }, { 'Retry-After': '5' }));
    const api = createOrakelApi(settings, { fetchImpl: fetchImpl as FetchLike, ...noSleep });

    await expect(api.contributeDomain('923609016', 'heiberg.co')).rejects.toBeInstanceOf(OrakelContributionLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
