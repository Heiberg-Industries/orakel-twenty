// Companies the live sweep (`app.live.mts`) creates in the test workspace, one per matching case.
//
// Where these come from:
// - Org numbers and websites: Brønnøysundregistrene, `GET https://data.brreg.no/enhetsregisteret/api/enheter/<org>`,
//   2026-10-13, verbatim `navn` / `hjemmeside`: 923609016 EQUINOR ASA www.equinor.com, 984851006 DNB BANK ASA
//   www.dnb.no, 982463718 TELENOR ASA www.telenor.no/, 910747711 ORKLA ASA (no website registered).
//   `GET …/enheter?navn=rema%201000&size=3`, same date: 186 hits (REMA 1000 AS 883409442 first).
// - Expected match results: SHAPED, not recorded. Derived from Orakel's matcher on origin/main @ 9d219f32
//   (`lib/crm/name-match.ts`, tiers 0.95 domain+name / 0.85 several at 0.95 / 0.75 domain only / 0.70 exact name /
//   0.55 and 0.35 name contains) and `GET /api/companies/match?name&domain`. The sweep prints what Orakel
//   actually returned for every case; paste that output into the ticket.
//
// Two directions (spec §6):
// - too eager: `autoWrite: 'never'` means no org number may be written without a person picking it, whatever
//   Orakel answers. `autoWrite: 'only-expected'` means a write is allowed, but only of `expectOrg`.
// - too strict: `expectOrg` must at least be suggested (in Orakel's candidates and on the card), or written.
//
// Each domain is used once: Twenty may refuse two companies with the same website.

export type MatchFixture = {
  key: string;
  name: string;
  domain: string | null;
  expectOrg: string | null;
  autoWrite: 'never' | 'only-expected';
  why: string;
};

export const MATCH_FIXTURES: MatchFixture[] = [
  // Too strict: real companies, named and with a website the way a person types them into a CRM.
  {
    key: 'strict-equinor',
    name: 'Equinor ASA',
    domain: 'equinor.com',
    expectOrg: '923609016',
    autoWrite: 'only-expected',
    why: 'own website + legal name: should reach 0.95 and be written',
  },
  {
    key: 'strict-dnb-url',
    name: 'dnb bank',
    domain: 'https://www.dnb.no/',
    expectOrg: '984851006',
    autoWrite: 'only-expected',
    why: 'lower case, no "ASA", website pasted as a full URL: still the same company',
  },
  {
    key: 'strict-telenor',
    name: 'Telenor ASA',
    domain: 'telenor.no',
    expectOrg: '982463718',
    autoWrite: 'only-expected',
    why: 'group website shared by subsidiaries: may drop to 0.85, but the parent must be suggested',
  },
  // Both directions on one record: a real company with no website.
  {
    key: 'name-only-orkla',
    name: 'Orkla ASA',
    domain: null,
    expectOrg: '910747711',
    autoWrite: 'never',
    why: 'exact name without a website is at most 0.70: suggested, never written',
  },
  // Too eager: nothing here may be written automatically.
  {
    key: 'eager-generic',
    name: 'Bygg AS',
    domain: null,
    expectOrg: null,
    autoWrite: 'never',
    why: 'generic name, many companies contain it',
  },
  {
    key: 'eager-chain',
    name: 'Rema 1000',
    domain: null,
    expectOrg: null,
    autoWrite: 'never',
    why: 'a chain: the head company, a holding company and one company per store',
  },
  {
    key: 'eager-lookalike-domain',
    name: 'Equinor ASA',
    domain: 'beckequinor.com',
    expectOrg: null,
    autoWrite: 'never',
    why: 'a website that only contains the name (the ORA-137 heiberg.co / beckheiberg.com case)',
  },
  {
    key: 'eager-wrong-name',
    name: 'Nordlys Testfirma AS',
    domain: 'orkla.com',
    expectOrg: null,
    autoWrite: 'never',
    why: 'a real website under a different name: at most 0.75',
  },
];

// The company the route checks (card, refresh, 5-year history, Find contacts, + Add) run on.
export const ROUTE_FIXTURE_KEY = 'strict-equinor';
// The company "Use this" is clicked on: suggested, not written.
export const USE_THIS_FIXTURE_KEY = 'name-only-orkla';
