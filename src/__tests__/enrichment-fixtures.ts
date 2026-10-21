import type { TwentyCompanyRecord } from 'src/enrichment/company-patch';
import type { OrakelCompany } from 'src/enrichment/orakel-values';

// Shapes follow Orakel's public API on origin/main @ a1441e7a (read from the code, not recorded).

export const orakelCompany = (overrides: Partial<OrakelCompany> = {}): OrakelCompany => ({
  orgNumber: '923609016',
  country: 'NO',
  name: 'Heiberg Industries AS',
  employeeCount: 12,
  orgFormCode: 'AS',
  naceDescription1: 'Konsulentvirksomhet tilknyttet informasjonsteknologi',
  isBankrupt: false,
  primaryDomain: 'heiberg.co',
  website: 'https://www.heiberg.co/about',
  technologies: [{ name: 'Next.js' }, { name: 'Vercel' }],
  linkedinHandle: 'heiberg-industries',
  businessAddressStreet: 'Storgata 1',
  businessAddressZip: '0155',
  businessAddressCity: 'OSLO',
  businessAddressLat: 59.91,
  businessAddressLng: 10.75,
  parentOrgNumber: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
  financials: [
    { periodTo: '2025-12-31T00:00:00.000Z', regnskapstype: 'SELSKAP', revenue: 1_000_000, operatingResult: 100_000, totalEquity: 500_000, totalAssets: 900_000, netResult: 80_000 },
    { periodTo: '2024-12-31T00:00:00.000Z', regnskapstype: 'SELSKAP', revenue: 800_000, operatingResult: 50_000, totalEquity: 400_000, totalAssets: 700_000, netResult: 30_000 },
  ],
  roles: [
    { roleTypeCode: 'DAGL', roleGroupCode: 'DAGL', personFirstName: 'Bendik', personLastName: 'Heiberg' },
    { roleTypeCode: 'LEDE', roleGroupCode: 'STYR', personFirstName: 'Kari', personMiddleName: 'M', personLastName: 'Nordmann' },
  ],
  ownership: null,
  ...overrides,
});

export const twentyCompany = (overrides: Partial<TwentyCompanyRecord> = {}): TwentyCompanyRecord => ({
  id: '0b5c6a40-3c8e-4a8e-9a43-7d1c2a7a0f11',
  name: 'Heiberg Industries',
  domainName: { primaryLinkUrl: 'https://heiberg.co', primaryLinkLabel: '', secondaryLinks: null },
  linkedinLink: { primaryLinkUrl: '', primaryLinkLabel: '', secondaryLinks: null },
  address: {
    addressStreet1: '',
    addressStreet2: '',
    addressCity: '',
    addressPostcode: '',
    addressState: '',
    addressCountry: '',
    addressLat: null,
    addressLng: null,
  },
  orakelOrgNumber: null,
  orakelDoNotEnrich: false,
  ...overrides,
});
