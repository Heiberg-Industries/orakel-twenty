import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { companyProfile, keyPeople, ownership, tenders, type ToolDeps } from 'src/automation/ai-tools';
import { addKeyPeople, companyHealth, findMatch } from 'src/automation/workflow-actions';
import type { OrakelSettings } from 'src/catalog/settings';
import type { OrakelCompanyCard } from 'src/widget/card-types';
import type { OrakelFetch } from 'src/widget/orakel-client';
import { type AddPersonDeps, nameFilter } from 'src/widget/people';
import { CompanyAccessError, type TwentyCompany } from 'src/widget/twenty-company';

// Orakel in Twenty workflows and Twenty AI (ORA-122, spec §7 #3).

const COMPANY_ID = '0b5c6a40-3c8e-4a8e-9a43-7d1c2a7a0f11';
const TODAY = new Date('2026-10-14T09:00:00Z');

const settings: OrakelSettings = {
  apiKey: 'orakel_test',
  baseUrl: 'https://orakel.test',
  fields: [],
  hiddenCardFields: [],
  contributeDomains: true,
};

const company = (overrides: Partial<TwentyCompany> = {}): TwentyCompany => ({
  id: COMPANY_ID,
  name: 'Heiberg Industries',
  domain: 'https://www.heiberg.co',
  orgNumber: '923609016',
  doNotEnrich: false,
  ...overrides,
});

const card = (intelligence: Partial<OrakelCompanyCard['intelligence']> = {}, overview: Partial<OrakelCompanyCard['overview']> = {}) => ({
  overview: {
    orgNumber: '923609016',
    companyName: 'HEIBERG INDUSTRIES AS',
    orgFormCode: 'AS',
    orgFormDescription: 'Aksjeselskap',
    naceCode: '62.010',
    naceDescription: 'Programmeringstjenester',
    foundingDate: '2019-11-01',
    employeeCount: 4,
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
  financials: [
    { year: 2025, revenue: 1_200_000, operatingResult: 300_000, netResult: 250_000, totalAssets: 900_000, totalEquity: 500_000 },
    { year: 2024, revenue: 800_000, operatingResult: 100_000, netResult: 80_000, totalAssets: 600_000, totalEquity: 250_000 },
  ],
  pdfYearCount: 2,
  intelligence: {
    ceo: 'Kari Nordmann',
    boardChair: 'Ola Hansen',
    boardMembers: ['Per Berg'],
    activeTenders: 2,
    latestTenderUrl: 'https://doffin.no/notices/1',
    latestTenderTitle: 'Rammeavtale IT',
    technologies: [],
    ...intelligence,
  },
});

// A fake Orakel that answers by path and records every call with its method.
const orakel = (routes: Record<string, { status?: number; body: unknown }>) => {
  const calls: { method: string; path: string }[] = [];
  const fetchImpl: OrakelFetch = vi.fn(async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ method: init.method, path });
    const route = routes[path] ?? { status: 404, body: { error: 'Not found' } };
    return { status: route.status ?? 200, json: async () => route.body };
  });
  return { calls, fetchImpl };
};

type StoredPerson = { id: string; firstName: string; lastName: string };

// An in-memory Twenty for "+ Add": answers name filters, records every write.
const fakeTwenty = (initial: StoredPerson[] = []) => {
  const people = [...initial];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let next = 1;
  const client = {
    get: vi.fn(async (_path: string, options?: { query?: Record<string, unknown> }) => {
      const filter = String(options?.query?.filter).toLowerCase();
      const matches = people.filter((person) => filter === nameFilter(`${person.firstName} ${person.lastName}`).toLowerCase());
      return { data: { people: matches.map((person) => ({ id: person.id, name: { firstName: person.firstName, lastName: person.lastName } })) } };
    }),
    post: vi.fn(async (path: string, body: Record<string, unknown>) => {
      writes.push({ path, body });
      const id = `00000000-0000-4000-8000-00000000000${next++}`;
      if (path === '/rest/people') {
        const name = body.name as { firstName: string; lastName: string };
        people.push({ id, ...name });
        return { data: { createPerson: { id } } };
      }
      return { data: { created: { id } } };
    }),
  };
  return { client: client as typeof client & NonNullable<AddPersonDeps['client']>, people, writes };
};

describe('orakel-add-key-people', () => {
  it('adds the CEO and the board chair from one card read, each with the "Added from Orakel" note', async () => {
    const twenty = fakeTwenty();
    const { calls, fetchImpl } = orakel({ '/api/companies/923609016/card': { body: card() } });

    const result = await addKeyPeople(company(), settings, { client: twenty.client, fetchImpl, today: () => TODAY });

    expect(result).toMatchObject({
      ok: true,
      added: [
        { role: 'ceo', name: 'Kari Nordmann', personId: '00000000-0000-4000-8000-000000000001' },
        { role: 'boardChair', name: 'Ola Hansen', personId: '00000000-0000-4000-8000-000000000004' },
      ],
      skipped: [],
    });
    expect(calls).toEqual([{ method: 'GET', path: '/api/companies/923609016/card' }]);
    expect(twenty.people.map((person) => `${person.firstName} ${person.lastName}`)).toEqual(['Kari Nordmann', 'Ola Hansen']);
    expect(twenty.writes.filter((write) => write.path === '/rest/notes').map((write) => write.body.title)).toEqual([
      'Added from Orakel: Brønnøysundregistrene, 2026-10-14',
      'Added from Orakel: Brønnøysundregistrene, 2026-10-14',
    ]);
    // Board members are not key people here.
    expect(twenty.people.some((person) => person.lastName === 'Berg')).toBe(false);
  });

  it('skips a person Twenty already has, and never forces the create', async () => {
    const twenty = fakeTwenty([{ id: '11111111-1111-4111-8111-111111111111', firstName: 'Kari', lastName: 'Nordmann' }]);
    const { fetchImpl } = orakel({ '/api/companies/923609016/card': { body: card() } });

    const result = await addKeyPeople(company(), settings, { client: twenty.client, fetchImpl, today: () => TODAY });

    expect(result.ok).toBe(true);
    expect(result.skipped).toEqual([
      { role: 'ceo', name: 'Kari Nordmann', reason: 'duplicate', existingPersonIds: ['11111111-1111-4111-8111-111111111111'] },
    ]);
    expect(result.added.map((person) => person.name)).toEqual(['Ola Hansen']);
    expect(twenty.people).toHaveLength(2);
  });

  it('a second run adds nobody', async () => {
    const twenty = fakeTwenty();
    const { fetchImpl } = orakel({ '/api/companies/923609016/card': { body: card() } });
    const deps = { client: twenty.client, fetchImpl, today: () => TODAY };

    await addKeyPeople(company(), settings, deps);
    const second = await addKeyPeople(company(), settings, deps);

    expect(second.added).toEqual([]);
    expect(second.skipped.map((skip) => skip.reason)).toEqual(['duplicate', 'duplicate']);
    expect(twenty.people).toHaveLength(2);
  });

  it('skips a suppressed role: Orakel\'s card leaves the person out, so nothing is created for them', async () => {
    const twenty = fakeTwenty();
    // The board chair asked to be hidden: `filterSuppressedRoles` blanks the role on the card.
    const { fetchImpl } = orakel({ '/api/companies/923609016/card': { body: card({ boardChair: null }) } });

    const result = await addKeyPeople(company(), settings, { client: twenty.client, fetchImpl, today: () => TODAY });

    expect(result.skipped).toEqual([{ role: 'boardChair', name: null, reason: 'not-listed' }]);
    expect(twenty.people.map((person) => person.firstName)).toEqual(['Kari']);
  });

  it('a CEO who is also board chair is added once', async () => {
    const twenty = fakeTwenty();
    const { fetchImpl } = orakel({ '/api/companies/923609016/card': { body: card({ boardChair: 'kari  nordmann' }) } });

    const result = await addKeyPeople(company(), settings, { client: twenty.client, fetchImpl, today: () => TODAY });

    expect(result.added).toHaveLength(1);
    expect(result.skipped).toEqual([{ role: 'boardChair', name: 'kari  nordmann', reason: 'same-person' }]);
    expect(twenty.people).toHaveLength(1);
  });

  it('opted out, no org number, or an Orakel failure: nothing is written', async () => {
    const twenty = fakeTwenty();
    const { calls, fetchImpl } = orakel({ '/api/companies/923609016/card': { status: 402, body: { code: 'trial_expired' } } });
    const deps = { client: twenty.client, fetchImpl };

    expect(await addKeyPeople(company({ doNotEnrich: true }), settings, deps)).toMatchObject({ ok: false, added: [] });
    expect(await addKeyPeople(company({ orgNumber: null }), settings, deps)).toMatchObject({
      ok: false,
      message: 'This company has no org number yet.',
    });
    expect(calls).toEqual([]);
    expect(await addKeyPeople(company(), settings, deps)).toMatchObject({ ok: false, message: 'The Orakel trial has expired.' });
    expect(twenty.client.post).not.toHaveBeenCalled();
  });
});

describe('orakel-find-match', () => {
  it("returns Orakel's best candidate and never writes", async () => {
    const candidates = [
      { orgNumber: '923609016', name: 'HEIBERG INDUSTRIES AS', city: 'OSLO', orgFormCode: 'AS', confidence: 0.97, matchedBy: 'domain' },
      { orgNumber: '999999999', name: 'HEIBERG AS', city: null, orgFormCode: 'AS', confidence: 0.6, matchedBy: 'name' },
    ];
    const { calls, fetchImpl } = orakel({ '/api/companies/match': { body: { candidates } } });

    expect(await findMatch(company({ orgNumber: null }), settings, fetchImpl)).toEqual({
      ok: true,
      found: true,
      alreadySet: false,
      orgNumber: '923609016',
      name: 'HEIBERG INDUSTRIES AS',
      confidence: 0.97,
      matchedBy: 'domain',
      candidates,
    });
    expect(calls).toEqual([{ method: 'GET', path: '/api/companies/match' }]);
  });

  it('a company that already has an org number returns it without asking Orakel', async () => {
    const { calls, fetchImpl } = orakel({});
    expect(await findMatch(company(), settings, fetchImpl)).toMatchObject({ found: true, alreadySet: true, orgNumber: '923609016' });
    expect(calls).toEqual([]);
  });

  it('no candidates or not found: found is false; opted out: ok is false', async () => {
    expect(await findMatch(company({ orgNumber: null }), settings, orakel({ '/api/companies/match': { body: { candidates: [] } } }).fetchImpl)).toMatchObject({
      ok: true,
      found: false,
    });
    expect(await findMatch(company({ orgNumber: null }), settings, orakel({}).fetchImpl)).toMatchObject({ ok: true, found: false });
    expect(await findMatch(company({ doNotEnrich: true }), settings, orakel({}).fetchImpl)).toMatchObject({ ok: false });
  });
});

describe('orakel-company-health', () => {
  it('reports status and the newest year of accounts', async () => {
    const { fetchImpl } = orakel({ '/api/companies/923609016/card': { body: card({}, { isBeingDissolved: true }) } });
    expect(await companyHealth(company(), settings, fetchImpl)).toEqual({
      ok: true,
      orgNumber: '923609016',
      companyName: 'HEIBERG INDUSTRIES AS',
      status: 'being-dissolved',
      isBankrupt: false,
      isBeingDissolved: true,
      latestYear: 2025,
      revenue: 1_200_000,
      operatingResult: 300_000,
      netResult: 250_000,
    });
  });

  it('bankrupt wins over being dissolved; no accounts gives nulls', async () => {
    const body = { ...card({}, { isBankrupt: true, isBeingDissolved: true }), financials: [] };
    const { fetchImpl } = orakel({ '/api/companies/923609016/card': { body } });
    expect(await companyHealth(company(), settings, fetchImpl)).toMatchObject({ status: 'bankrupt', latestYear: null, revenue: null });
  });
});

describe('AI tools are read-only', () => {
  const routes = {
    '/api/companies/923609016/card': { body: card() },
    '/api/companies/923609016/shareholders': { body: { data: [{ shareholderName: 'HEIBERG HOLDING AS', ownershipPct: 100 }], availableYears: [2025] } },
    '/api/companies/923609016/group': { body: { root: { orgNumber: '923609016', name: 'HEIBERG INDUSTRIES AS', children: [] }, totalMembers: 1 } },
  };
  const deps = (fetchImpl: OrakelFetch, found: TwentyCompany = company()): ToolDeps => ({
    readCompany: vi.fn(async () => found),
    fetchImpl,
  });

  it('every tool only reads: GET calls to Orakel, and only a read of the company from Twenty', async () => {
    const { calls, fetchImpl } = orakel(routes);
    const toolDeps = deps(fetchImpl);

    const profile = await companyProfile({ companyId: COMPANY_ID }, settings, toolDeps);
    const people = await keyPeople({ companyId: COMPANY_ID }, settings, toolDeps);
    const open = await tenders({ companyId: COMPANY_ID }, settings, toolDeps);
    const owners = await ownership({ companyId: COMPANY_ID }, settings, toolDeps);

    expect(profile).toMatchObject({
      ok: true,
      companyName: 'HEIBERG INDUSTRIES AS',
      status: 'active',
      address: 'Storgata 1, 0155 OSLO',
      industry: '62.010 Programmeringstjenester',
      financials: [{ year: 2025 }, { year: 2024 }],
    });
    expect(people).toEqual({
      ok: true,
      orgNumber: '923609016',
      companyName: 'HEIBERG INDUSTRIES AS',
      ceo: 'Kari Nordmann',
      boardChair: 'Ola Hansen',
      boardMembers: ['Per Berg'],
    });
    expect(open).toMatchObject({ ok: true, activeTenders: 2, latestTender: { title: 'Rammeavtale IT', url: 'https://doffin.no/notices/1' } });
    expect(owners).toMatchObject({ ok: true, orgNumber: '923609016', shareholders: { data: [{ ownershipPct: 100 }] } });

    expect(calls.every((call) => call.method === 'GET')).toBe(true);
    expect(calls.some((call) => /contacts|financial-history|domain/.test(call.path))).toBe(false);
  });

  it('takes an org number instead of a company id, without reading Twenty', async () => {
    const { fetchImpl } = orakel(routes);
    const toolDeps = deps(fetchImpl);
    expect(await keyPeople({ orgNumber: '923 609 016' }, settings, toolDeps)).toMatchObject({ ok: true, ceo: 'Kari Nordmann' });
    expect(toolDeps.readCompany).not.toHaveBeenCalled();
  });

  it('honours "Do not enrich", and says what is missing or not allowed', async () => {
    const { calls, fetchImpl } = orakel(routes);
    expect(await companyProfile({ companyId: COMPANY_ID }, settings, deps(fetchImpl, company({ doNotEnrich: true })))).toEqual({
      ok: false,
      message: 'Orakel is turned off for this company ("Do not enrich").',
    });
    expect(await tenders({}, settings, deps(fetchImpl))).toMatchObject({ ok: false });
    expect(await tenders({ orgNumber: 'abc' }, settings, deps(fetchImpl))).toMatchObject({ ok: false });
    expect(calls).toEqual([]);

    const refused: ToolDeps = {
      readCompany: async () => {
        throw new CompanyAccessError("You can't read this company, or it no longer exists.", 403);
      },
      fetchImpl,
    };
    expect(await ownership({ companyId: COMPANY_ID }, settings, refused)).toEqual({
      ok: false,
      message: "You can't read this company, or it no longer exists.",
    });
  });
});

describe('what workflows and AI can reach', () => {
  // Spec §7 #3: website contact scraping stays a button a person clicks. Neither the workflow
  // actions nor the AI tools may reach it, nor any other call that asks Orakel to do work.
  const sources = [
    ...['src/automation'].flatMap((dir) => readdirSync(dir).map((file) => join(dir, file))),
    ...readdirSync('src/logic-functions')
      .filter((file) => file.startsWith('orakel'))
      .map((file) => join('src/logic-functions', file)),
  ];

  it('has the 4 workflow actions and the 4 AI tools', () => {
    const files = sources.filter((file) => file.startsWith('src/logic-functions')).map((file) => readFileSync(file, 'utf8'));
    expect(files.filter((source) => source.includes('workflowActionTriggerSettings'))).toHaveLength(4);
    expect(files.filter((source) => source.includes('toolTriggerSettings'))).toHaveLength(4);
  });

  it('never imports contact scraping, the 5-year PDF reading or domain proposals', () => {
    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/findContacts|fetchFinancialHistory|proposeCrmDomain|\/contacts/);
    }
  });

  it('AI tools never import a writer', () => {
    const tools = sources.filter((file) => readFileSync(file, 'utf8').includes('toolTriggerSettings'));
    expect(tools).toHaveLength(4);
    for (const file of [...tools, 'src/automation/ai-tools.ts']) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/addPerson|addKeyPeople|refreshCompany|writeOrgNumber|\.post\(|\.patch\(/);
    }
  });
});
