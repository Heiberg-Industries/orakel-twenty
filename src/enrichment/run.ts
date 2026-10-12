import { orakelFieldName } from 'src/catalog/company-fields';
import type { TwentyCompanyRecord } from 'src/enrichment/company-patch';
import {
  enrichCompany,
  type EnrichDeps,
  type EnrichOutcome,
  type EnrichRunContext,
} from 'src/enrichment/enrich-company';
import { OrakelStopError } from 'src/enrichment/orakel-api';
import type { OrakelCompany } from 'src/enrichment/orakel-values';

// Counting and stopping, shared by enrich-on-change and enrich-all. Every failure is logged and
// counted; an OrakelStopError (key invalid, trial over, quota) ends the run with its message as
// the status.

// `notAttempted`: companies a run left alone (not processed after a stop, or unmatched companies
// in the weekly run).
export type RunTotals = Record<EnrichOutcome, number> & { contributed: number; notAttempted: number };

export type RunSummary = {
  totals: RunTotals;
  // Set when Orakel refused to go on; the companies after this point were not processed.
  stopped?: string;
  errors: string[];
};

const MAX_REPORTED_ERRORS = 20;

export const emptyTotals = (): RunTotals => ({
  enriched: 0,
  unchanged: 0,
  'skipped-do-not-enrich': 0,
  'no-match': 0,
  'not-found': 0,
  failed: 0,
  contributed: 0,
  notAttempted: 0,
});

export const emptySummary = (): RunSummary => ({ totals: emptyTotals(), errors: [] });

export const addTotals = (into: RunTotals, from: RunTotals) => {
  for (const key of Object.keys(into) as (keyof RunTotals)[]) {
    into[key] += from[key];
  }
};

export const describeSummary = ({ totals, stopped }: RunSummary) => {
  const counts = `enriched ${totals.enriched}, unchanged ${totals.unchanged}, no match ${totals['no-match']}, ` +
    `not in Orakel ${totals['not-found']}, do not enrich ${totals['skipped-do-not-enrich']}, ` +
    `failed ${totals.failed}, not attempted ${totals.notAttempted}, websites shared ${totals.contributed}`;
  return stopped ? `Stopped: ${stopped} (${counts})` : counts;
};

export const enrichRecords = async (
  records: TwentyCompanyRecord[],
  deps: EnrichDeps,
  context: EnrichRunContext,
  summary: RunSummary,
  prefetched?: Map<string, OrakelCompany>,
): Promise<RunSummary> => {
  for (const [index, record] of records.entries()) {
    if (summary.stopped) {
      summary.totals.notAttempted += records.length - index;
      break;
    }
    try {
      const orgNumber = String(record[orakelFieldName('orgNumber')] ?? '').trim();
      const fromBatch = prefetched && orgNumber ? (prefetched.get(orgNumber) ?? null) : undefined;
      const result = await enrichCompany(record, deps, context, fromBatch);
      summary.totals[result.outcome] += 1;
      if (result.contributed) summary.totals.contributed += 1;
      if (result.outcome === 'failed') {
        const message = `company ${record.id}: ${result.error}`;
        console.error(`[orakel] ${message}`);
        if (summary.errors.length < MAX_REPORTED_ERRORS) summary.errors.push(message);
      }
    } catch (error) {
      if (error instanceof OrakelStopError) {
        summary.stopped = error.message;
        summary.totals.notAttempted += records.length - index;
        console.error(`[orakel] stopped: ${error.message}`);
        break;
      }
      throw error;
    }
  }
  return summary;
};
