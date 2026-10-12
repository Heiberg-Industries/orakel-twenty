import { orakelFieldName } from 'src/catalog/company-fields';
import { readOrakelSettings } from 'src/catalog/settings';
import {
  APP_WRITTEN_FIELD_NAMES,
  linkUrl,
  type TwentyCompanyRecord,
} from 'src/enrichment/company-patch';
import { type EnrichDeps, normalizeDomain } from 'src/enrichment/enrich-company';
import { createOrakelApi, OrakelStopError, type OrakelApi } from 'src/enrichment/orakel-api';
import { describeSummary, emptySummary, enrichRecords, type RunSummary } from 'src/enrichment/run';
import { companyHasField, createTwentyApi, type TwentyApi } from 'src/enrichment/twenty-api';

// enrich-on-change: a batch of `company.created` / `company.updated` events.
//
// The update trigger watches only `orakelOrgNumber` and `domainName`. The function itself writes
// `orakel*` fields (and fills an empty `domainName`), so an update that also changed a field only
// the app can write is the app's own write and is ignored: the function never loops on itself.

export const WATCHED_FIELDS = [orakelFieldName('orgNumber'), 'domainName'];

export type CompanyEvent = {
  recordId: string;
  properties: {
    after?: Record<string, unknown>;
    before?: Record<string, unknown>;
    updatedFields?: string[];
  };
};

const orgNumberOf = (record: Record<string, unknown> | undefined) =>
  String(record?.[orakelFieldName('orgNumber')] ?? '').trim();

const isOwnWrite = (event: CompanyEvent) =>
  (event.properties.updatedFields ?? []).some((field) => APP_WRITTEN_FIELD_NAMES.includes(field));

// A user who deletes the org number is undoing a match: matching straight back would rewrite it.
const isOrgNumberCleared = (event: CompanyEvent) =>
  (event.properties.updatedFields ?? []).includes(orakelFieldName('orgNumber')) &&
  orgNumberOf(event.properties.before) !== '' &&
  orgNumberOf(event.properties.after) === '';

const shouldEnrich = (event: CompanyEvent) => {
  const { after, updatedFields } = event.properties;
  if (!after || after.deletedAt) return false;
  if (updatedFields === undefined) return true; // company.created
  if (!updatedFields.some((field) => WATCHED_FIELDS.includes(field))) return false;
  return !isOwnWrite(event) && !isOrgNumberCleared(event);
};

// One record per company (its latest state), for the companies at least one event qualifies.
export const companiesToEnrich = (events: CompanyEvent[]): TwentyCompanyRecord[] => {
  const latest = new Map<string, Record<string, unknown>>();
  const qualifies = new Set<string>();
  for (const event of events) {
    if (event.properties.after) latest.set(event.recordId, event.properties.after);
    if (shouldEnrich(event)) qualifies.add(event.recordId);
  }
  return [...qualifies].map((id) => ({ ...latest.get(id), id }) as TwentyCompanyRecord);
};

export const conflictCheck =
  (twenty: Pick<TwentyApi, 'findCompaniesByOrgNumber'>): EnrichDeps['isDomainConflicted'] =>
  async (orgNumber, recordId, domain) =>
    (await twenty.findCompaniesByOrgNumber(orgNumber)).some((other) => {
      const otherDomain = normalizeDomain(linkUrl(other.domainName));
      return other.id !== recordId && otherDomain !== null && otherDomain !== domain;
    });

export type OnChangeDeps = {
  env: Record<string, string | undefined>;
  orakel?: OrakelApi;
  twenty?: Pick<TwentyApi, 'updateCompany' | 'findCompaniesByOrgNumber'>;
  hasEmployeesField?: (sample: Record<string, unknown> | undefined) => Promise<boolean>;
};

export const runOnChange = async (events: CompanyEvent[], deps: OnChangeDeps): Promise<RunSummary> => {
  const summary = emptySummary();
  const records = companiesToEnrich(events);
  if (records.length === 0) return summary;

  const settings = readOrakelSettings(deps.env);
  let orakel: OrakelApi;
  try {
    orakel = deps.orakel ?? createOrakelApi(settings);
  } catch (error) {
    if (!(error instanceof OrakelStopError)) throw error;
    summary.stopped = error.message;
    console.error(`[orakel] enrich-on-change: ${error.message}`);
    return summary;
  }
  const twenty = deps.twenty ?? createTwentyApi();
  const hasEmployeesField = await (deps.hasEmployeesField ?? ((sample) => companyHasField('employees', sample)))(
    records[0],
  );

  await enrichRecords(
    records,
    {
      orakel,
      updateCompany: twenty.updateCompany,
      isDomainConflicted: conflictCheck(twenty),
    },
    {
      selectedSlugs: settings.fields,
      hasEmployeesField,
      contributeDomains: settings.contributeDomains,
      contributionsAllowed: true,
    },
    summary,
  );

  console.log(`[orakel] enrich-on-change: ${records.length} companies. ${describeSummary(summary)}`);
  return summary;
};
