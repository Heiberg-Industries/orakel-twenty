import { orakelFieldName } from 'src/catalog/company-fields';
import {
  buildCompanyPatch,
  linkUrl,
  type TwentyCompanyRecord,
} from 'src/enrichment/company-patch';
import {
  AUTO_WRITE_CONFIDENCE,
  detectCountry,
  OrakelContributionLimitError,
  OrakelStopError,
  type OrakelApi,
} from 'src/enrichment/orakel-api';
import type { OrakelCompany, TenderExtra } from 'src/enrichment/orakel-values';

// One company, in the order of spec §2.1 (port of Orakel's `enrichTwentyCompany`):
//   1. `orakelDoNotEnrich` set → stop.
//   2. `orakelOrgNumber` set → fetch that company from Orakel.
//   3. Otherwise ask Orakel to match by name and domain. Only a single candidate at ≥0.95 is
//      written; anything weaker is left for the card's suggestions.
//   4. PATCH the selected `orakel*` fields (and empty built-ins) in one write.
//   5. Send the company's domain to Orakel's review queue, unless sharing is off, the org number
//      has conflicting domains in this workspace, or the domain is the one Orakel already has.
// An OrakelStopError (key invalid, trial over, quota) is thrown on: the caller stops the run.

export type EnrichOutcome =
  | 'enriched'
  | 'unchanged'
  | 'skipped-do-not-enrich'
  | 'no-match'
  | 'not-found'
  | 'failed';

export type EnrichResult = {
  outcome: EnrichOutcome;
  orgNumber?: string;
  contributed?: boolean;
  error?: string;
};

export type EnrichRunContext = {
  selectedSlugs: string[];
  hasEmployeesField: boolean;
  contributeDomains: boolean;
  // Turned off for the rest of the run once Orakel's contribution limit is reached.
  contributionsAllowed: boolean;
};

export type EnrichDeps = {
  orakel: Pick<OrakelApi, 'getCompany' | 'match' | 'getTenders' | 'contributeDomain'>;
  // Throws when Twenty refuses the write.
  updateCompany: (id: string, patch: Record<string, unknown>) => Promise<void>;
  // True when another company in this workspace has the same org number and a different domain.
  isDomainConflicted: (orgNumber: string, recordId: string, domain: string) => Promise<boolean>;
  log?: (message: string) => void;
};

const TENDER_SLUGS = ['activeTenders', 'latestTenderUrl'];

// Host only, lower case, no protocol, port, path or `www.`: for comparing two domains.
export const normalizeDomain = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const enrichCompany = async (
  record: TwentyCompanyRecord,
  deps: EnrichDeps,
  context: EnrichRunContext,
  // From a batch fetch: the Orakel company, or null when Orakel doesn't know the org number.
  prefetched?: OrakelCompany | null,
): Promise<EnrichResult> => {
  const log = deps.log ?? console.log;

  // 1. Do not enrich.
  if (record[orakelFieldName('doNotEnrich')] === true) {
    return { outcome: 'skipped-do-not-enrich' };
  }

  const storedOrgNumber = String(record[orakelFieldName('orgNumber')] ?? '').trim();
  const domain = linkUrl(record.domainName);
  let orgNumber = storedOrgNumber;
  let company: OrakelCompany | null;

  try {
    if (orgNumber) {
      // 2. Org number set: fetch.
      if (!detectCountry(orgNumber)) {
        return { outcome: 'failed', orgNumber, error: `org number "${orgNumber}" is not a Nordic org number` };
      }
      company = prefetched !== undefined ? prefetched : await deps.orakel.getCompany(orgNumber);
    } else {
      // 3. Match.
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      if (!name) return { outcome: 'no-match' };
      const candidates = await deps.orakel.match(name, domain);
      const confident = candidates.filter((candidate) => candidate.confidence >= AUTO_WRITE_CONFIDENCE);
      if (confident.length !== 1 || !detectCountry(confident[0].orgNumber)) {
        return { outcome: 'no-match' };
      }
      orgNumber = confident[0].orgNumber;
      log(`[orakel] company ${record.id} matched to ${orgNumber} (confidence ${confident[0].confidence})`);
      company = await deps.orakel.getCompany(orgNumber);
    }
  } catch (error) {
    if (error instanceof OrakelStopError) throw error;
    return { outcome: 'failed', orgNumber: orgNumber || undefined, error: errorMessage(error) };
  }

  if (!company) {
    return { outcome: 'not-found', orgNumber };
  }

  // 4. Write.
  let tenders: TenderExtra = {};
  if (
    context.selectedSlugs.some((slug) => TENDER_SLUGS.includes(slug)) &&
    detectCountry(orgNumber) === 'NO'
  ) {
    try {
      tenders = await deps.orakel.getTenders(orgNumber);
    } catch (error) {
      if (error instanceof OrakelStopError) throw error;
      // The other fields are still worth writing; tender fields are just left as they are.
      log(`[orakel] tenders for ${orgNumber} unavailable: ${errorMessage(error)}`);
    }
  }

  const patch = buildCompanyPatch(record, company, {
    selectedSlugs: context.selectedSlugs,
    hasEmployeesField: context.hasEmployeesField,
    tenders,
  });

  let outcome: EnrichOutcome = 'unchanged';
  if (Object.keys(patch).length > 0) {
    try {
      await deps.updateCompany(record.id, patch);
      outcome = 'enriched';
    } catch (error) {
      const message = `write to company ${record.id} failed: ${errorMessage(error)}`;
      console.error(`[orakel] ${message}`);
      return { outcome: 'failed', orgNumber, error: message };
    }
  }

  // 5. Domain contribution.
  const crmDomain = normalizeDomain(domain);
  let contributed = false;
  if (
    context.contributeDomains &&
    context.contributionsAllowed &&
    crmDomain &&
    detectCountry(orgNumber) === 'NO' &&
    crmDomain !== normalizeDomain(company.primaryDomain)
  ) {
    try {
      if (await deps.isDomainConflicted(orgNumber, record.id, crmDomain)) {
        log(`[orakel] ${orgNumber} has conflicting domains in this workspace; not shared with Orakel`);
      } else {
        contributed = await deps.orakel.contributeDomain(orgNumber, crmDomain);
      }
    } catch (error) {
      if (error instanceof OrakelStopError) throw error;
      if (error instanceof OrakelContributionLimitError) {
        context.contributionsAllowed = false;
        log(`[orakel] ${error.message}; no more domains are shared in this run`);
      } else {
        console.error(`[orakel] domain contribution for ${orgNumber} failed: ${errorMessage(error)}`);
      }
    }
  }

  return { outcome, orgNumber, contributed };
};
