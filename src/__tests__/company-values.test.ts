import { describe, expect, it } from 'vitest';

import { ORAKEL_CRM_FIELDS } from 'src/catalog/orakel-crm-fields.snapshot';
import { buildCompanyPatch } from 'src/enrichment/company-patch';
import { buildEnrichmentValues, latestAccounts, SLUG_TO_VALUE_FN } from 'src/enrichment/orakel-values';

import { orakelCompany, twentyCompany } from './enrichment-fixtures';

const ALL_SLUGS = ORAKEL_CRM_FIELDS.map((field) => field.slug);

describe('Orakel values per slug (port of buildEnrichmentValues)', () => {
  it('has a value function for every catalog slug', () => {
    expect(Object.keys(SLUG_TO_VALUE_FN).sort()).toEqual([...ALL_SLUGS].sort());
  });

  it('maps the profile to slug values and leaves out what Orakel lacks', () => {
    const values = buildEnrichmentValues(orakelCompany(), ALL_SLUGS);

    expect(values).toMatchObject({
      orgNumber: '923609016',
      companyName: 'Heiberg Industries AS',
      employeeCount: 12,
      revenue: 1_000_000,
      ceoName: 'Bendik Heiberg',
      boardChair: 'Kari M Nordmann',
      website: 'heiberg.co',
      techStack: 'Next.js, Vercel',
      linkedinUrl: 'https://linkedin.com/company/heiberg-industries',
      municipality: 'OSLO',
      isBankrupt: false,
      isSubsidiary: false,
    });
    for (const absent of ['boardMembers', 'auditorName', 'majorityOwner', 'activeTenders', 'latestTenderUrl']) {
      expect(values).not.toHaveProperty(absent);
    }
  });

  it('picks the latest accounts like Orakel: no group accounts, Brreg beats the PDF-only row', () => {
    expect(
      latestAccounts([
        { periodTo: '2025-12-31', regnskapstype: 'KONSERN', revenue: 9 },
        { periodTo: '2025-12-31', regnskapstype: 'SELSKAPSREGNSKAP', revenue: 2 },
        { periodTo: '2025-12-31', regnskapstype: 'SELSKAP', revenue: 3 },
        { periodTo: '2024-12-31', regnskapstype: 'SELSKAP', revenue: 1 },
      ])?.revenue,
    ).toBe(3);
  });

  it("computes owners from Orakel's ownership summary", () => {
    const company = orakelCompany({
      ownership: {
        year: 2024,
        holderCount: 2,
        topHolders: [
          { name: 'Holding AS', orgNumber: '100000002', kind: 'company', pct: 75 },
          { name: 'Ola Nordmann', orgNumber: null, kind: 'person', pct: 25 },
        ],
      },
    });
    const values = buildEnrichmentValues(company, ['isSubsidiary', 'parentCompanyName', 'majorityOwner', 'largestShareholder']);

    expect(values).toEqual({
      isSubsidiary: true,
      parentCompanyName: 'Holding AS',
      majorityOwner: 'Holding AS (75.0%)',
      largestShareholder: 'Holding AS (75.0%)',
    });
  });

  it('finds the auditor and accounting firm in the roles (the batch endpoint has no `advisors`)', () => {
    const values = buildEnrichmentValues(
      orakelCompany({
        roles: [
          { roleTypeCode: 'REVI', roleGroupCode: 'REVI', entityName: 'Revisor AS', entityOrgNumber: '911111111' },
          { roleTypeCode: 'REGN', roleGroupCode: 'REGN', entityName: 'Regnskap AS', entityOrgNumber: '922222222' },
          { roleTypeCode: 'MEDL', roleGroupCode: 'STYR', personFirstName: 'A', personLastName: 'One' },
          { roleTypeCode: 'MEDL', roleGroupCode: 'STYR', personFirstName: 'B', personLastName: 'Two' },
          { roleTypeCode: 'MEDL', roleGroupCode: 'STYR', personFirstName: 'Gone', isResigned: true },
        ],
      }),
      ['auditorName', 'auditorOrgNumber', 'accountingFirmName', 'accountingFirmOrgNumber', 'boardMembers'],
    );

    expect(values).toEqual({
      auditorName: 'Revisor AS',
      auditorOrgNumber: '911111111',
      accountingFirmName: 'Regnskap AS',
      accountingFirmOrgNumber: '922222222',
      boardMembers: 'A One, B Two',
    });
  });
});

describe('the Twenty write (never-clear rule, built-ins only when empty)', () => {
  const context = { selectedSlugs: ['companyName', 'employeeCount', 'revenue', 'ceoName', 'website', 'streetAddress', 'postalCode', 'linkedinUrl'], hasEmployeesField: false };

  it('writes the org number and the selected orakel* fields, nothing unselected', () => {
    const patch = buildCompanyPatch(twentyCompany(), orakelCompany(), context);

    expect(patch).toMatchObject({
      orakelOrgNumber: '923609016',
      orakelCompanyName: 'Heiberg Industries AS',
      orakelEmployeeCount: 12,
      orakelRevenue: 1_000_000,
      orakelCeoName: 'Bendik Heiberg',
      orakelWebsite: 'heiberg.co',
    });
    expect(patch).not.toHaveProperty('orakelOrgForm');
    expect(patch).not.toHaveProperty('name');
  });

  it('never sends a blank: a value Orakel no longer has stays as it is', () => {
    const record = twentyCompany({ orakelOrgNumber: '923609016', orakelCeoName: 'Previous CEO' });
    const patch = buildCompanyPatch(record, orakelCompany({ roles: [], financials: [] }), context);

    expect(patch).not.toHaveProperty('orakelCeoName');
    expect(patch).not.toHaveProperty('orakelRevenue');
    expect(Object.values(patch)).not.toContain(null);
  });

  it('leaves out values that are already there, so an unchanged company gets no write', () => {
    const first = buildCompanyPatch(twentyCompany(), orakelCompany(), context);
    const record = twentyCompany({ ...first, domainName: { primaryLinkUrl: 'https://heiberg.co' } });

    expect(buildCompanyPatch(record, orakelCompany(), context)).toEqual({});
  });

  it('fills empty built-ins: domain, LinkedIn, and the address with its map position', () => {
    const patch = buildCompanyPatch(twentyCompany({ domainName: { primaryLinkUrl: '' } }), orakelCompany(), context);

    expect(patch.domainName).toEqual({ primaryLinkUrl: 'heiberg.co' });
    expect(patch.linkedinLink).toEqual({ primaryLinkUrl: 'https://linkedin.com/company/heiberg-industries' });
    expect(patch.address).toEqual({
      addressStreet1: 'Storgata 1',
      addressStreet2: '',
      addressCity: 'OSLO',
      addressPostcode: '0155',
      addressState: '',
      addressCountry: 'Norway',
      addressLat: 59.91,
      addressLng: 10.75,
    });
  });

  it('never overwrites a built-in someone else filled in', () => {
    const record = twentyCompany({
      domainName: { primaryLinkUrl: 'https://other.no' },
      linkedinLink: { primaryLinkUrl: 'https://linkedin.com/company/mine' },
      address: { addressStreet1: 'Min gate 2', addressCity: 'Bergen', addressPostcode: '5003' },
      employees: 40,
    });
    const patch = buildCompanyPatch(record, orakelCompany(), { ...context, hasEmployeesField: true });

    for (const builtIn of ['domainName', 'linkedinLink', 'address', 'employees']) {
      expect(patch).not.toHaveProperty(builtIn);
    }
  });

  it('fills built-ins only for selected fields', () => {
    const patch = buildCompanyPatch(
      twentyCompany({ domainName: { primaryLinkUrl: '' } }),
      orakelCompany(),
      { selectedSlugs: ['revenue'], hasEmployeesField: true },
    );

    expect(Object.keys(patch).sort()).toEqual(['orakelOrgNumber', 'orakelRevenue']);
  });

  describe('employees', () => {
    it('is written when the workspace has the field and it is empty', () => {
      const patch = buildCompanyPatch(twentyCompany({ employees: null }), orakelCompany(), { ...context, hasEmployeesField: true });

      expect(patch.employees).toBe(12);
      expect(patch.orakelEmployeeCount).toBe(12);
    });

    it('is skipped when the workspace has no such field (fresh 2.42 workspaces); the count still lands in orakelEmployeeCount', () => {
      const patch = buildCompanyPatch(twentyCompany(), orakelCompany(), { ...context, hasEmployeesField: false });

      expect(patch).not.toHaveProperty('employees');
      expect(patch.orakelEmployeeCount).toBe(12);
    });
  });
});
