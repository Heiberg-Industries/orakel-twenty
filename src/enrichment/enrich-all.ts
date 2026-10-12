import { orakelFieldName } from 'src/catalog/company-fields';
import { readOrakelSettings } from 'src/catalog/settings';
import { linkUrl, type TwentyCompanyRecord } from 'src/enrichment/company-patch';
import { normalizeDomain } from 'src/enrichment/enrich-company';
import {
  createOrakelApi,
  detectCountry,
  MAX_ENRICH_BATCH,
  OrakelStopError,
  type OrakelApi,
} from 'src/enrichment/orakel-api';
import type { OrakelCompany } from 'src/enrichment/orakel-values';
import {
  describeSummary,
  emptyTotals,
  enrichRecords,
  type RunSummary,
  type RunTotals,
} from 'src/enrichment/run';
import { companyHasField, createTwentyApi, type TwentyApi } from 'src/enrichment/twenty-api';

// "Enrich all companies": the button and the weekly cron. Port of Orakel's Twenty backfill
// (`lib/twenty/backfill.ts`) with the conflict set and `sinceDate` of `lib/hubspot/backfill.ts`.
//
// - Reads every Twenty company once per part (for the conflict set), then works through them in
//   id order, 100 per Orakel call (`POST /api/companies/enrich`).
// - Twenty calls are paced under its 100 requests per 60 s (see `twenty-api.ts`).
// - A function runs 15 minutes at most. When the time budget is used up, the run hands itself on
//   as a background job carrying the last company id done and the counts so far.
// - The button run also matches companies without an org number, as Orakel's Twenty backfill did.
//   The weekly run doesn't (re-matching every unmatched company each week would bill the same
//   misses again; new companies are matched on creation). It passes `sinceDate` (8 days back), so
//   companies Orakel has not updated since are not rewritten.

export const RUN_BUDGET_MS = 12 * 60_000;
export const CONTINUATION_DELAY_MS = 60_000;
export const WEEKLY_SINCE_DAYS = 8;

export type EnrichAllState = {
  mode: 'button' | 'weekly';
  sinceDate: string | null;
  // Companies with an id at or below this one are done.
  afterId: string | null;
  totals: RunTotals | null;
  contributionsAllowed: boolean;
  part: number;
};

export type EnrichAllDeps = {
  env: Record<string, string | undefined>;
  now: () => number;
  enqueue: (state: EnrichAllState) => Promise<void>;
  orakel?: OrakelApi;
  twenty?: Pick<TwentyApi, 'listCompanies' | 'updateCompany'>;
  hasEmployeesField?: (sample: Record<string, unknown> | undefined) => Promise<boolean>;
};

const orgNumberOf = (record: TwentyCompanyRecord) => String(record[orakelFieldName('orgNumber')] ?? '').trim();

export const collectAllCompanies = async (
  twenty: Pick<TwentyApi, 'listCompanies'>,
): Promise<TwentyCompanyRecord[]> => {
  const companies: TwentyCompanyRecord[] = [];
  let cursor: string | null = null;
  do {
    const page = await twenty.listCompanies(cursor);
    companies.push(...page.records);
    cursor = page.nextCursor;
  } while (cursor);
  return companies;
};

// Org numbers that appear on two or more companies with different domains. Their domains are not
// sent to Orakel: the workspace itself disagrees about which one is right.
export const buildConflictSet = (companies: TwentyCompanyRecord[]): Set<string> => {
  const domainsByOrg = new Map<string, Set<string>>();
  for (const company of companies) {
    const orgNumber = orgNumberOf(company);
    const domain = normalizeDomain(linkUrl(company.domainName));
    if (!orgNumber || !domain) continue;
    domainsByOrg.set(orgNumber, (domainsByOrg.get(orgNumber) ?? new Set()).add(domain));
  }
  return new Set([...domainsByOrg].filter(([, domains]) => domains.size > 1).map(([orgNumber]) => orgNumber));
};

const isOlderThan = (company: OrakelCompany | undefined, since: number) =>
  company?.updatedAt != null && Date.parse(company.updatedAt) <= since;

export const runEnrichAll = async (state: EnrichAllState, deps: EnrichAllDeps): Promise<RunSummary> => {
  const startedAt = deps.now();
  const label = `enrich-all (${state.mode}${state.part > 1 ? `, part ${state.part}` : ''})`;
  const summary: RunSummary = { totals: state.totals ?? emptyTotals(), errors: [] };
  const report = (suffix: string) => {
    const line = `[orakel] ${label}: ${describeSummary(summary)}. ${suffix}`;
    if (summary.stopped || summary.totals.failed > 0) console.error(line);
    else console.log(line);
  };

  const settings = readOrakelSettings(deps.env);
  let orakel: OrakelApi;
  try {
    orakel = deps.orakel ?? createOrakelApi(settings);
  } catch (error) {
    if (!(error instanceof OrakelStopError)) throw error;
    summary.stopped = error.message;
    report('Nothing was enriched.');
    return summary;
  }
  const twenty = deps.twenty ?? createTwentyApi();

  const all = await collectAllCompanies(twenty);
  const todo = all
    .filter((company) => state.afterId === null || company.id > state.afterId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const conflicted = buildConflictSet(all);
  if (conflicted.size > 0) {
    console.log(
      `[orakel] ${conflicted.size} org number(s) appear on several companies with different domains; their domains are not sent to Orakel: ${[...conflicted].join(', ')}`,
    );
  }

  const context = {
    selectedSlugs: settings.fields,
    hasEmployeesField: await (deps.hasEmployeesField ?? ((sample) => companyHasField('employees', sample)))(all[0]),
    contributeDomains: settings.contributeDomains,
    contributionsAllowed: state.contributionsAllowed,
  };
  const enrichDeps = {
    orakel,
    updateCompany: twenty.updateCompany,
    isDomainConflicted: async (orgNumber: string) => conflicted.has(orgNumber),
  };
  const since = state.sinceDate ? Date.parse(state.sinceDate) : null;

  for (let start = 0; start < todo.length; start += MAX_ENRICH_BATCH) {
    const batch = todo.slice(start, start + MAX_ENRICH_BATCH);
    const doNotEnrich = (record: TwentyCompanyRecord) => record[orakelFieldName('doNotEnrich')] === true;
    const orgNumbers = [
      ...new Set(batch.filter((record) => !doNotEnrich(record)).map(orgNumberOf).filter((org) => detectCountry(org))),
    ];

    let prefetched: Map<string, OrakelCompany>;
    try {
      prefetched = await orakel.enrichBatch(orgNumbers);
    } catch (error) {
      if (error instanceof OrakelStopError) {
        summary.stopped = error.message;
        summary.totals.notAttempted += todo.length - start;
        report('');
        return summary;
      }
      // Orakel failed this batch: count its companies with an org number as failed and go on.
      const failedHere = batch.filter((record) => orgNumbers.includes(orgNumberOf(record)));
      summary.totals.failed += failedHere.length;
      summary.errors.push(`batch from company ${batch[0].id}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`[orakel] ${label}: Orakel batch fetch failed for ${failedHere.length} companies: ${String(error)}`);
      prefetched = new Map();
      batch.splice(0, batch.length, ...batch.filter((record) => !failedHere.includes(record)));
    }

    const toEnrich = batch.filter((record) => {
      const orgNumber = orgNumberOf(record);
      if (doNotEnrich(record)) return true;
      if (!orgNumber) {
        if (state.mode === 'weekly') {
          summary.totals.notAttempted += 1;
          return false;
        }
        return true;
      }
      if (since !== null && isOlderThan(prefetched.get(orgNumber), since)) {
        summary.totals.unchanged += 1;
        return false;
      }
      return true;
    });

    await enrichRecords(toEnrich, enrichDeps, context, summary, prefetched);

    const remaining = todo.length - start - MAX_ENRICH_BATCH;
    if (summary.stopped) {
      if (remaining > 0) summary.totals.notAttempted += remaining;
      report('');
      return summary;
    }

    if (remaining > 0 && deps.now() - startedAt > RUN_BUDGET_MS) {
      const next: EnrichAllState = {
        ...state,
        afterId: todo[start + MAX_ENRICH_BATCH - 1].id,
        totals: summary.totals,
        contributionsAllowed: context.contributionsAllowed,
        part: state.part + 1,
      };
      try {
        await deps.enqueue(next);
        report(`Time is up; ${remaining} companies continue in part ${next.part}.`);
      } catch (error) {
        summary.stopped = `could not schedule the rest of the run (${remaining} companies): ${error instanceof Error ? error.message : String(error)}`;
        summary.totals.notAttempted += remaining;
        report('');
      }
      return summary;
    }
  }

  report('Done.');
  return summary;
};

export const weeklyState = (now: number): EnrichAllState => ({
  mode: 'weekly',
  sinceDate: new Date(now - WEEKLY_SINCE_DAYS * 24 * 60 * 60_000).toISOString(),
  afterId: null,
  totals: null,
  contributionsAllowed: true,
  part: 1,
});

export const buttonState = (sinceDate: string | null): EnrichAllState => ({
  mode: 'button',
  sinceDate,
  afterId: null,
  totals: null,
  contributionsAllowed: true,
  part: 1,
});

// `sinceDate` from a request body: an ISO date, or nothing.
export const parseSinceDate = (raw: unknown): string | null | 'invalid' => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 'invalid' : date.toISOString();
};

export const isEnrichAllState = (value: unknown): value is EnrichAllState =>
  typeof value === 'object' &&
  value !== null &&
  ((value as EnrichAllState).mode === 'button' || (value as EnrichAllState).mode === 'weekly') &&
  typeof (value as EnrichAllState).part === 'number';
