import { describe, expect, it, vi } from 'vitest';

import { checkOrakelKey } from 'src/catalog/orakel-key-status';

// Response bodies are shaped from Orakel's API key check (2026-10-01), not recorded.
const respond = (status: number, body: unknown = {}) =>
  vi.fn(async () => ({ status, json: async () => body }));

const settings = { apiKey: 'orakel_test', baseUrl: 'https://orakel.cloud' };

describe('checkOrakelKey', () => {
  it('reports a missing key without calling Orakel', async () => {
    const fetchImpl = respond(200);
    const result = await checkOrakelKey({ ...settings, apiKey: undefined }, fetchImpl);

    expect(result).toMatchObject({ status: 'ERROR', title: 'Orakel API key missing' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports an invalid key on 401', async () => {
    const result = await checkOrakelKey(settings, respond(401, { error: 'Invalid API key' }));

    expect(result).toMatchObject({ status: 'ERROR', title: 'Orakel API key invalid' });
  });

  it('reports an expired trial on 402 trial_expired, with the upgrade link', async () => {
    const result = await checkOrakelKey(
      settings,
      respond(402, { error: 'Trial expired', code: 'trial_expired', upgradeUrl: 'https://orakel.cloud/activate' }),
    );

    expect(result).toMatchObject({ status: 'ERROR', title: 'Orakel trial expired' });
    expect('description' in result && result.description).toContain('https://orakel.cloud/activate');
  });

  it('keeps other payment states apart from an expired trial', async () => {
    const result = await checkOrakelKey(settings, respond(402, { code: 'payment_required' }));

    expect(result).toMatchObject({ status: 'ERROR', title: 'Orakel subscription inactive' });
  });

  it('is OK on 200 and calls the usage endpoint with the key', async () => {
    const fetchImpl = respond(200, { tier: 'free' });
    const result = await checkOrakelKey(settings, fetchImpl);

    expect(result).toEqual({ status: 'OK' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://orakel.cloud/api/keys/usage',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer orakel_test' }) }),
    );
  });

  it('never shows green for an unexpected status or a network failure', async () => {
    expect((await checkOrakelKey(settings, respond(500))).status).toBe('WARNING');
    expect(
      (await checkOrakelKey(settings, vi.fn(async () => { throw new Error('ENOTFOUND'); }))).status,
    ).toBe('WARNING');
  });
});
