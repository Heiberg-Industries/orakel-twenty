import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COMPANY_FIELD_ENTRIES, orakelFieldName } from 'src/catalog/company-fields';
import {
  ORAKEL_CRM_FIELDS,
  ORAKEL_DEFAULT_FIELD_SELECTION,
} from 'src/catalog/orakel-crm-fields.snapshot';
import { DEFAULT_FIELD_SELECTION, ORAKEL_FIELD_OPTIONS } from 'src/catalog/settings';
import appConfig from 'src/application-config';

// The app must declare exactly Orakel's catalog on Company (orakel `lib/crm/fields.ts` CRM_FIELDS,
// snapshot in `orakel-crm-fields.snapshot.ts` — refresh it there), plus the `doNotEnrich` control field.

const CONTROL_SLUGS = ['doNotEnrich'];
const catalogSlugs = ORAKEL_CRM_FIELDS.map((field) => field.slug);

const loadFieldManifests = async () => {
  const dir = join(__dirname, '..', 'fields');
  const files = readdirSync(dir).filter((file) => file.endsWith('.field.ts'));

  return Promise.all(
    files.map(async (file) => (await import(join(dir, file))).default.config),
  );
};

describe('Orakel fields on Company', () => {
  it('mirrors CRM_FIELDS one-to-one, plus the control field', () => {
    const appSlugs = COMPANY_FIELD_ENTRIES.map((entry) => entry.slug);

    expect(appSlugs.filter((slug) => !CONTROL_SLUGS.includes(slug))).toEqual(catalogSlugs);
    expect(appSlugs.filter((slug) => CONTROL_SLUGS.includes(slug))).toEqual(CONTROL_SLUGS);
  });

  it('uses the catalog labels', () => {
    for (const field of ORAKEL_CRM_FIELDS) {
      expect(COMPANY_FIELD_ENTRIES.find((entry) => entry.slug === field.slug)?.label).toBe(field.label);
    }
  });

  it('has one field file per entry, each a valid orakel* field on Company', async () => {
    const manifests = await loadFieldManifests();
    const names = manifests.map((manifest) => manifest.name).sort();

    expect(names).toEqual(COMPANY_FIELD_ENTRIES.map((entry) => orakelFieldName(entry.slug)).sort());
    expect(names).toContain('orakelOrgNumber');
    expect(names).toContain('orakelEmployeeCount');
    expect(names).toContain('orakelDoNotEnrich');
    expect(names.every((name) => /^orakel[A-Z]/.test(name))).toBe(true);
  });

  it('lets users edit only the org number and the do-not-enrich switch', async () => {
    const manifests = await loadFieldManifests();
    const open = manifests
      .filter((manifest) => manifest.writability !== 'APPLICATION')
      .map((manifest) => manifest.name)
      .sort();

    expect(open).toEqual(['orakelDoNotEnrich', 'orakelOrgNumber']);
  });

  it('has unique universal identifiers', () => {
    const ids = COMPANY_FIELD_ENTRIES.map((entry) => entry.universalIdentifier);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ORAKEL_FIELDS setting', () => {
  it('offers every catalog field and defaults to DEFAULT_FIELD_SELECTION', () => {
    expect(ORAKEL_FIELD_OPTIONS.map((option) => option.value)).toEqual(catalogSlugs);
    expect(DEFAULT_FIELD_SELECTION).toEqual(ORAKEL_DEFAULT_FIELD_SELECTION);

    const variable = appConfig.config.applicationVariables?.ORAKEL_FIELDS;
    expect(variable?.type).toBe('MULTI_SELECT');
    expect(variable && 'value' in variable ? variable.value : undefined).toEqual(DEFAULT_FIELD_SELECTION);
  });

  it('keeps the API key secret', () => {
    expect(appConfig.config.applicationVariables?.ORAKEL_API_KEY?.isSecret).toBe(true);
  });
});
