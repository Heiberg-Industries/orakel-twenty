import { RestApiClientError } from 'twenty-client-sdk/rest';
import { describe, expect, it, vi } from 'vitest';

import type { OrakelSettings } from 'src/catalog/settings';
import { findContacts } from 'src/widget/card-actions';
import type { OrakelCompanyCard } from 'src/widget/card-types';
import type { OrakelFetch } from 'src/widget/orakel-client';
import { addPerson, type AddPersonDeps, emailFilter, filterValue, nameFilter, sourceNoteTitle, splitName } from 'src/widget/people';
import type { TwentyCompany } from 'src/widget/twenty-company';

// The People tab's "+ Add" and Find contacts (ORA-120). Orakel's card already leaves out suppressed
// people (`buildCompanyCard` → `filterSuppressedRoles`, origin/main), so the fake card below plays
// the part of a card where one board member has been suppressed.

const COMPANY_ID = '0b5c6a40-3c8e-4a8e-9a43-7d1c2a7a0f11';
const TODAY = new Date('2026-10-13T09:00:00Z');

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

// "Siri Suppressed" is on the company's board in the register but asked to be hidden: Orakel's card
// does not list her.
const intelligence: OrakelCompanyCard['intelligence'] = {
  ceo: 'Kari Nordmann',
  boardChair: 'Ola Johan Hansen',
  boardMembers: ['Per Berg'],
  activeTenders: 0,
  latestTenderUrl: null,
  latestTenderTitle: null,
  technologies: [],
};

const orakel = (status = 200, body: unknown = { overview: { country: 'NO' }, intelligence }) => {
  const calls: string[] = [];
  const fetchImpl: OrakelFetch = vi.fn(async (url) => {
    calls.push(url);
    return { status, json: async () => body };
  });
  return { calls, fetchImpl };
};

type StoredPerson = { id: string; firstName: string; lastName: string; email: string | null };

// An in-memory Twenty: answers the duplicate filters `people.ts` builds, and records every write.
const fakeTwenty = (initial: StoredPerson[] = [], failOn: Partial<Record<string, unknown>> = {}) => {
  const people = [...initial];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let next = 1;

  const client = {
    get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
      expect(path).toBe('/rest/people');
      const filter = String(options?.query?.filter);
      const matches = people.filter(
        (person) =>
          (person.email !== null && filter === emailFilter(person.email)) ||
          filter.toLowerCase() === nameFilter(`${person.firstName} ${person.lastName}`).toLowerCase(),
      );
      return {
        data: {
          people: matches.map((person) => ({
            id: person.id,
            name: { firstName: person.firstName, lastName: person.lastName },
            emails: { primaryEmail: person.email },
          })),
        },
      };
    }),
    post: vi.fn(async (path: string, body: Record<string, unknown>) => {
      if (failOn[path]) throw failOn[path];
      writes.push({ path, body });
      const id = `00000000-0000-4000-8000-00000000000${next++}`;
      if (path === '/rest/people') {
        const name = body.name as { firstName: string; lastName: string } | undefined;
        const email = (body.emails as { primaryEmail: string } | undefined)?.primaryEmail ?? null;
        people.push({ id, firstName: name?.firstName ?? '', lastName: name?.lastName ?? '', email });
        return { data: { createPerson: { id } } };
      }
      if (path === '/rest/notes') return { data: { createNote: { id } } };
      return { data: { createNoteTarget: { id } } };
    }),
  };
  // The REST client's methods are generic in their answer; this fake answers one shape.
  return { client: client as typeof client & NonNullable<AddPersonDeps['client']>, people, writes };
};

describe('addPerson: a registry person, by name', () => {
  it('creates the Person on the company, with the "Added from Orakel" note linked to it', async () => {
    const twenty = fakeTwenty();
    const { calls, fetchImpl } = orakel();

    const result = await addPerson(company(), { name: 'Kari Nordmann', force: false }, settings, {
      client: twenty.client,
      fetchImpl,
      today: () => TODAY,
    });

    expect(calls).toEqual(['https://orakel.test/api/companies/923609016/card']);
    expect(result).toEqual({ ok: true, personId: '00000000-0000-4000-8000-000000000001' });
    expect(twenty.writes).toEqual([
      {
        path: '/rest/people',
        body: { name: { firstName: 'Kari', lastName: 'Nordmann' }, companyId: COMPANY_ID },
      },
      {
        path: '/rest/notes',
        body: {
          title: 'Added from Orakel: Brønnøysundregistrene, 2026-10-13',
          bodyV2: { markdown: 'Added from Orakel: Brønnøysundregistrene, 2026-10-13', blocknote: null },
        },
      },
      {
        path: '/rest/noteTargets',
        body: { noteId: '00000000-0000-4000-8000-000000000002', targetPersonId: '00000000-0000-4000-8000-000000000001' },
      },
    ]);
  });

  it('a second "+ Add" finds the duplicate and creates nothing; "Create anyway" then does', async () => {
    const twenty = fakeTwenty();
    const deps = { client: twenty.client, fetchImpl: orakel().fetchImpl, today: () => TODAY };

    await addPerson(company(), { name: 'Kari Nordmann', force: false }, settings, deps);
    const second = await addPerson(company(), { name: 'Kari Nordmann', force: false }, settings, deps);

    expect(second).toEqual({
      ok: false,
      matchedBy: 'name',
      duplicates: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Kari Nordmann' }],
    });
    expect(twenty.people).toHaveLength(1);

    const forced = await addPerson(company(), { name: 'Kari Nordmann', force: true }, settings, deps);
    expect(forced).toMatchObject({ ok: true });
    expect(twenty.people).toHaveLength(2);
  });

  it('a suppressed person can not be created: the card does not list them, so nothing is written', async () => {
    const twenty = fakeTwenty();

    const result = await addPerson(company(), { name: 'Siri Suppressed', force: true }, settings, {
      client: twenty.client,
      fetchImpl: orakel().fetchImpl,
    });

    expect(result).toEqual({ ok: false, message: 'Orakel does not list this person for this company.' });
    expect(twenty.client.get).not.toHaveBeenCalled();
    expect(twenty.client.post).not.toHaveBeenCalled();
  });

  it('uses the name as Orakel lists it, whatever spacing or case the widget sent', async () => {
    const twenty = fakeTwenty();
    await addPerson(company(), { name: '  ola   JOHAN hansen ', force: false }, settings, {
      client: twenty.client,
      fetchImpl: orakel().fetchImpl,
    });
    expect(twenty.writes[0].body.name).toEqual({ firstName: 'Ola', lastName: 'Johan Hansen' });
  });

  it('opted out, no org number, or an Orakel failure: nothing is written', async () => {
    const twenty = fakeTwenty();
    const deps = { client: twenty.client, fetchImpl: orakel(402, { code: 'trial_expired' }).fetchImpl };

    expect(await addPerson(company({ doNotEnrich: true }), { name: 'Kari Nordmann', force: false }, settings, deps)).toMatchObject({ ok: false });
    expect(await addPerson(company({ orgNumber: null }), { name: 'Kari Nordmann', force: false }, settings, deps)).toEqual({
      ok: false,
      message: 'This company has no org number yet.',
    });
    expect(await addPerson(company(), { name: 'Kari Nordmann', force: false }, settings, deps)).toEqual({
      ok: false,
      message: 'The Orakel trial has expired.',
    });
    expect(twenty.client.post).not.toHaveBeenCalled();
  });

  it('a failed note is reported, not swallowed: the Person exists', async () => {
    const twenty = fakeTwenty([], { '/rest/notes': new RestApiClientError('boom', { status: 500 }) });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await addPerson(company(), { name: 'Per Berg', force: false }, settings, {
      client: twenty.client,
      fetchImpl: orakel().fetchImpl,
    });

    expect(result).toMatchObject({ ok: true, noteError: expect.stringContaining('note could not be saved') });
    expect(twenty.people).toHaveLength(1);
  });
});

describe('addPerson: an email address from Find contacts', () => {
  it('checks the email first; a match there can not be overridden', async () => {
    const twenty = fakeTwenty([
      { id: '11111111-1111-4111-8111-111111111111', firstName: 'Post', lastName: 'Mottak', email: 'post@heiberg.co' },
    ]);

    const result = await addPerson(company(), { email: ' Post@Heiberg.co ', force: true }, settings, {
      client: twenty.client,
    });

    expect(result).toEqual({
      ok: false,
      matchedBy: 'email',
      duplicates: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Post Mottak' }],
    });
    expect(twenty.client.post).not.toHaveBeenCalled();
  });

  it('creates the Person with the address, noting the website it came from; no Orakel call', async () => {
    const twenty = fakeTwenty();
    const { calls, fetchImpl } = orakel();

    const result = await addPerson(company(), { email: 'salg@heiberg.co', force: false }, settings, {
      client: twenty.client,
      fetchImpl,
      today: () => TODAY,
    });

    expect(result).toMatchObject({ ok: true });
    expect(calls).toEqual([]);
    expect(twenty.writes[0]).toEqual({
      path: '/rest/people',
      body: { emails: { primaryEmail: 'salg@heiberg.co' }, companyId: COMPANY_ID },
    });
    expect(twenty.writes[1].body.title).toBe('Added from Orakel: website heiberg.co, 2026-10-13');
  });

  it('the create race: Twenty refuses the second address, and the winner is shown as the duplicate', async () => {
    const twenty = fakeTwenty();
    twenty.client.post.mockImplementationOnce(async () => {
      twenty.people.push({ id: '22222222-2222-4222-8222-222222222222', firstName: '', lastName: '', email: 'salg@heiberg.co' });
      throw new RestApiClientError('duplicate', { status: 409 });
    });

    const result = await addPerson(company(), { email: 'salg@heiberg.co', force: false }, settings, {
      client: twenty.client,
    });

    expect(result).toEqual({
      ok: false,
      matchedBy: 'email',
      duplicates: [{ id: '22222222-2222-4222-8222-222222222222', name: 'salg@heiberg.co' }],
    });
  });

  it('refuses something that is not an email address', async () => {
    const twenty = fakeTwenty();
    expect(await addPerson(company(), { email: 'not an email', force: false }, settings, { client: twenty.client })).toEqual({
      ok: false,
      message: 'That is not an email address.',
    });
  });
});

describe('Twenty filters and names', () => {
  it('escapes quotes and backslashes inside a filter value', () => {
    expect(filterValue('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(emailFilter('x@y.no')).toBe('emails.primaryEmail[eq]:"x@y.no"');
  });

  it('matches names case-insensitively, but exactly when the name holds a LIKE wildcard', () => {
    expect(nameFilter('Ola Johan Hansen')).toBe('and(name.firstName[ilike]:"Ola",name.lastName[ilike]:"Johan Hansen")');
    expect(nameFilter('Cher')).toBe('name.firstName[ilike]:"Cher"');
    expect(nameFilter('A_b C')).toBe('and(name.firstName[eq]:"A_b",name.lastName[ilike]:"C")');
  });

  it('splits on the first space and the note carries the date', () => {
    expect(splitName(' Kari  Nordmann ')).toEqual({ firstName: 'Kari', lastName: 'Nordmann' });
    expect(sourceNoteTitle('Brønnøysundregistrene', TODAY)).toBe('Added from Orakel: Brønnøysundregistrene, 2026-10-13');
  });
});

describe('findContacts', () => {
  it('returns what Orakel found on the website', async () => {
    const { calls, fetchImpl } = orakel(200, { emails: ['post@heiberg.co'], phones: ['+47 22 00 00 00'] });
    expect(await findContacts(company(), settings, fetchImpl)).toEqual({
      ok: true,
      contacts: { emails: ['post@heiberg.co'], phones: ['+47 22 00 00 00'], noWebsite: false },
    });
    expect(calls).toEqual(['https://orakel.test/api/companies/923609016/contacts']);
  });

  it('"No website" when Orakel knows none', async () => {
    const { fetchImpl } = orakel(200, { emails: [], phones: [], noWebsite: true });
    expect(await findContacts(company(), settings, fetchImpl)).toMatchObject({ ok: true, contacts: { noWebsite: true } });
  });

  it('no call for a non-Norwegian org number or an opted-out company; a failed scrape says so', async () => {
    const { calls, fetchImpl } = orakel(502, { error: 'Scrape failed' });
    expect(await findContacts(company({ orgNumber: '5560000000' }), settings, fetchImpl)).toMatchObject({ ok: false });
    expect(await findContacts(company({ doNotEnrich: true }), settings, fetchImpl)).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
    expect(await findContacts(company(), settings, fetchImpl)).toEqual({
      ok: false,
      message: "Orakel could not read the company's website.",
    });
  });
});
