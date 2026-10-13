import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';

import type { OrakelSettings } from 'src/catalog/settings';
import { normalizeDomain } from 'src/enrichment/enrich-company';
import type { AddPersonResult, OrakelCompanyCard, PersonMatch } from 'src/widget/card-types';
import { orakelFailureMessage } from 'src/widget/card-actions';
import { callOrakel, type OrakelFetch } from 'src/widget/orakel-client';
import type { TwentyCompany } from 'src/widget/twenty-company';

// "+ Add" in the Company widget: creates a Twenty Person linked to the company, as the person who
// clicked, so Twenty's own permissions decide whether they may. Ported from the HubSpot card's
// `app/api/hubspot/card/contact/route.ts` (duplicate check) and `lib/twenty/inbound.ts` (filter
// escaping, create id, the create race), Orakel origin/main.
//
// A registry person is only created if Orakel's card lists them for this company right now. The
// card leaves out everyone who asked to be hidden (`filterSuppressedRoles`, server-side in Orakel),
// so a suppressed person can be neither shown nor created, whatever name the widget sends.

type PeopleClient = Pick<RestApiClient, 'get' | 'post'>;

export type AddPersonInput = { name: string; force: boolean } | { email: string; force: boolean };

export type AddPersonDeps = {
  client?: PeopleClient;
  fetchImpl?: OrakelFetch;
  today?: () => Date;
};

const MAX_DUPLICATES = 5;
const EMAIL_PATTERN = /^[^\s@"\\]+@[^\s@"\\]+\.[^\s@"\\]+$/;

// The register each country's roles come from.
const SOURCE_REGISTERS: Record<string, string> = {
  NO: 'Brønnøysundregistrene',
  SE: 'Bolagsverket',
  DK: 'CVR',
  FI: 'PRH',
};

export const sourceRegister = (country: string | null | undefined) =>
  SOURCE_REGISTERS[country ?? ''] ?? 'company register';

// Spec §7 #5: every Person created through "+ Add" says where it came from.
export const sourceNoteTitle = (source: string, date: Date) =>
  `Added from Orakel: ${source}, ${date.toISOString().slice(0, 10)}`;

export const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
};

const normalizeName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ');

// The people the card shows on the People tab, already without suppressed people.
export const listedPeople = (card: OrakelCompanyCard) =>
  [card.intelligence.ceo, card.intelligence.boardChair, ...(card.intelligence.boardMembers ?? [])].filter(
    (name): name is string => typeof name === 'string' && name.trim() !== '',
  );

// Twenty's FULL_NAME composite: first word, then the rest.
export const splitName = (name: string) => {
  const trimmed = normalizeName(name);
  const space = trimmed.indexOf(' ');
  return space === -1
    ? { firstName: trimmed, lastName: '' }
    : { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1) };
};

// A value inside a Twenty REST filter string literal. The client URL-encodes the query itself.
export const filterValue = (raw: string) => `"${raw.replace(/[\\"]/g, (match) => `\\${match}`)}"`;

// Case-insensitive where it's safe: `ilike` treats `%` and `_` as wildcards, so a name holding
// either is compared exactly instead.
const nameCondition = (field: string, value: string) =>
  /[%_]/.test(value) ? `${field}[eq]:${filterValue(value)}` : `${field}[ilike]:${filterValue(value)}`;

export const emailFilter = (email: string) => `emails.primaryEmail[eq]:${filterValue(email)}`;

export const nameFilter = (name: string) => {
  const { firstName, lastName } = splitName(name);
  const first = nameCondition('name.firstName', firstName);
  return lastName ? `and(${first},${nameCondition('name.lastName', lastName)})` : first;
};

type PersonRecord = {
  id?: unknown;
  name?: { firstName?: unknown; lastName?: unknown } | null;
  emails?: { primaryEmail?: unknown } | null;
};

const personLabel = (record: PersonRecord) => {
  const name = [record.name?.firstName, record.name?.lastName]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' ');
  const email = typeof record.emails?.primaryEmail === 'string' ? record.emails.primaryEmail : '';
  return name || email || 'Unnamed person';
};

const findPeople = async (client: PeopleClient, filter: string): Promise<PersonMatch[]> => {
  const body = await client.get<{ data?: { people?: PersonRecord[] } }>('/rest/people', {
    query: { filter, limit: MAX_DUPLICATES, depth: 0 },
  });
  const people = Array.isArray(body?.data?.people) ? body.data.people : [];
  return people
    .filter((record): record is PersonRecord & { id: string } => typeof record.id === 'string')
    .map((record) => ({ id: record.id, name: personLabel(record) }));
};

// The id of a just-created record, whatever key Twenty wraps it in (`createPerson`, `person`, ...).
export const extractCreatedId = (body: unknown): string | null => {
  const data = (body as { data?: unknown } | null)?.data;
  if (!data || typeof data !== 'object') {
    return null;
  }
  for (const value of Object.values(data)) {
    if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
      return (value as { id: string }).id;
    }
  }
  return null;
};

const describe = (error: unknown) => {
  if (error instanceof RestApiClientError) {
    const body = error.body === undefined ? '' : ` ${JSON.stringify(error.body).slice(0, 200)}`;
    return `HTTP ${error.status ?? '?'}${body}`;
  }
  return error instanceof Error ? error.message : String(error);
};

const isRefused = (error: unknown) =>
  error instanceof RestApiClientError && (error.status === 401 || error.status === 403);

// The note goes on the Person's timeline. Its title carries the whole line, so it reads the same
// in every list of notes; the body repeats it.
const writeSourceNote = async (client: PeopleClient, personId: string, title: string) => {
  const note = await client.post('/rest/notes', { title, bodyV2: { markdown: title, blocknote: null } });
  const noteId = extractCreatedId(note);
  if (!noteId) {
    throw new Error('Twenty created the note but sent no id');
  }
  await client.post('/rest/noteTargets', { noteId, targetPersonId: personId });
};

export const addPerson = async (
  company: TwentyCompany,
  input: AddPersonInput,
  settings: OrakelSettings,
  deps: AddPersonDeps = {},
): Promise<AddPersonResult> => {
  const client = deps.client ?? new RestApiClient();
  const today = deps.today ?? (() => new Date());

  if (company.doNotEnrich) {
    return { ok: false, message: 'Orakel is turned off for this company ("Do not enrich").' };
  }

  let source: string;
  let person: Record<string, unknown>;
  let email: string | null = null;

  if ('email' in input) {
    email = normalizeEmail(input.email);
    if (!email) {
      return { ok: false, message: 'That is not an email address.' };
    }
    const website = normalizeDomain(company.domain);
    source = website ? `website ${website}` : 'company website';
    person = { emails: { primaryEmail: email } };
  } else {
    if (!company.orgNumber) {
      return { ok: false, message: 'This company has no org number yet.' };
    }
    // Re-read the card now, rather than trusting the name the widget sent: only someone Orakel
    // lists (and so has not suppressed) for this very company can be created.
    const card = await callOrakel<OrakelCompanyCard>(
      settings,
      `/api/companies/${encodeURIComponent(company.orgNumber)}/card`,
      {},
      deps.fetchImpl,
    );
    if (!card.ok) {
      return { ok: false, message: orakelFailureMessage(card) };
    }
    const wanted = normalizeName(input.name).toLowerCase();
    const listed = listedPeople(card.data).find((name) => normalizeName(name).toLowerCase() === wanted);
    if (!listed) {
      return { ok: false, message: 'Orakel does not list this person for this company.' };
    }
    source = sourceRegister(card.data.overview?.country);
    person = { name: splitName(listed) };
  }

  const findDuplicates = async (): Promise<{ duplicates: PersonMatch[]; matchedBy: 'email' | 'name' } | null> => {
    if (email) {
      const byEmail = await findPeople(client, emailFilter(email));
      return byEmail.length > 0 ? { duplicates: byEmail, matchedBy: 'email' } : null;
    }
    if (input.force) {
      return null;
    }
    const { firstName, lastName } = person.name as { firstName: string; lastName: string };
    const byName = await findPeople(client, nameFilter(`${firstName} ${lastName}`));
    return byName.length > 0 ? { duplicates: byName, matchedBy: 'name' } : null;
  };

  try {
    // Email first: an address belongs to one person, so a match there is certain; a name is not.
    const duplicate = await findDuplicates();
    if (duplicate) {
      return { ok: false, ...duplicate };
    }
  } catch (error) {
    if (isRefused(error)) {
      return { ok: false, message: "You can't see people in Twenty, so Orakel can't check for duplicates." };
    }
    return { ok: false, message: `Could not check Twenty for this person (${describe(error)}).` };
  }

  let personId: string | null;
  try {
    personId = extractCreatedId(await client.post('/rest/people', { ...person, companyId: company.id }));
  } catch (error) {
    // The create race: someone added the same address between the check and the create. Twenty
    // keeps emails unique and refuses the second one; show the person who won.
    if (email && !isRefused(error)) {
      const raced = await findPeople(client, emailFilter(email)).catch(() => []);
      if (raced.length > 0) {
        return { ok: false, duplicates: raced, matchedBy: 'email' };
      }
    }
    if (isRefused(error)) {
      return { ok: false, message: "You can't create people in Twenty." };
    }
    return { ok: false, message: `Could not create the person (${describe(error)}).` };
  }
  if (!personId) {
    return { ok: false, message: 'Twenty did not confirm the new person. Check People before trying again.' };
  }

  // Never swallow a failed write: the Person exists, so say the note is missing.
  try {
    await writeSourceNote(client, personId, sourceNoteTitle(source, today()));
    return { ok: true, personId };
  } catch (error) {
    console.error(`[orakel] source note for person ${personId} failed: ${describe(error)}`);
    return { ok: true, personId, noteError: 'The person was added, but the "Added from Orakel" note could not be saved.' };
  }
};
