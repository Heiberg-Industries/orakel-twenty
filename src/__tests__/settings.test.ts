import { describe, expect, it } from 'vitest';

import { DEFAULT_FIELD_SELECTION, readOrakelSettings } from 'src/catalog/settings';

// Variable values arrive in process.env as strings; MULTI_SELECT as a JSON array string.
// Shape verified live on Twenty 2.42.6 (2026-10-01): '["orgForm","revenue"]'.

describe('readOrakelSettings', () => {
  it('parses MULTI_SELECT values from JSON strings', () => {
    const settings = readOrakelSettings({
      ORAKEL_API_KEY: 'orakel_test',
      ORAKEL_FIELDS: '["orgForm","revenue"]',
      ORAKEL_HIDDEN_CARD_FIELDS: '["phone"]',
      ORAKEL_CONTRIBUTE_DOMAINS: 'false',
    });

    expect(settings).toEqual({
      apiKey: 'orakel_test',
      baseUrl: 'https://orakel.cloud',
      fields: ['orgForm', 'revenue'],
      hiddenCardFields: ['phone'],
      contributeDomains: false,
    });
  });

  it('falls back to defaults for unset or malformed values', () => {
    const settings = readOrakelSettings({
      ORAKEL_API_KEY: '  ',
      ORAKEL_BASE_URL: 'https://staging.orakel.cloud/',
      ORAKEL_FIELDS: 'orgForm,revenue',
    });

    expect(settings.apiKey).toBeUndefined();
    expect(settings.baseUrl).toBe('https://staging.orakel.cloud');
    expect(settings.fields).toEqual(DEFAULT_FIELD_SELECTION);
    expect(settings.hiddenCardFields).toEqual([]);
    expect(settings.contributeDomains).toBe(true);
  });
});
