import { readOrakelSettings } from 'src/catalog/settings';
import type { TwentyCompanyRecord } from 'src/enrichment/company-patch';
import { enrichCompany, type EnrichDeps, type EnrichOutcome } from 'src/enrichment/enrich-company';
import { createOrakelApi, OrakelStopError, type OrakelApi } from 'src/enrichment/orakel-api';
import { conflictCheck } from 'src/enrichment/on-change';
import { companyHasField, createTwentyApi, type TwentyApi } from 'src/enrichment/twenty-api';

// The widget's Refresh button: re-enrich this one company now, with the same steps as
// enrich-on-change (spec §2.1). The caller has already read the record as the person who clicked,
// so only someone who can see the company can refresh it; the write itself uses the app's access,
// because only the app may write the `orakel*` fields.

export type RefreshResult = { ok: boolean; message: string; outcome?: EnrichOutcome };

const MESSAGES: Record<EnrichOutcome, string> = {
  enriched: 'Orakel fields updated.',
  unchanged: 'Orakel fields are already up to date.',
  'skipped-do-not-enrich': 'Orakel is turned off for this company ("Do not enrich").',
  'no-match': 'No certain match in Orakel. Pick one of the suggestions in the Orakel card.',
  'not-found': 'Orakel has no company with this org number.',
  failed: 'Could not refresh the Orakel fields.',
};

export type RefreshDeps = {
  env: Record<string, string | undefined>;
  orakel?: OrakelApi;
  twenty?: Pick<TwentyApi, 'updateCompany' | 'findCompaniesByOrgNumber'>;
  hasEmployeesField?: (record: Record<string, unknown>) => Promise<boolean>;
};

export const refreshCompany = async (record: TwentyCompanyRecord, deps: RefreshDeps): Promise<RefreshResult> => {
  const settings = readOrakelSettings(deps.env);

  try {
    const orakel = deps.orakel ?? createOrakelApi(settings);
    const twenty = deps.twenty ?? createTwentyApi();
    const hasEmployeesField = await (deps.hasEmployeesField ?? ((sample) => companyHasField('employees', sample)))(
      record,
    );
    const enrichDeps: EnrichDeps = {
      orakel,
      updateCompany: twenty.updateCompany,
      isDomainConflicted: conflictCheck(twenty),
    };

    const result = await enrichCompany(record, enrichDeps, {
      selectedSlugs: settings.fields,
      hasEmployeesField,
      contributeDomains: settings.contributeDomains,
      contributionsAllowed: true,
    });

    if (result.outcome === 'failed') {
      console.error(`[orakel] refresh of company ${record.id} failed: ${result.error}`);
    }
    return {
      ok: result.outcome !== 'failed',
      outcome: result.outcome,
      message: result.outcome === 'failed' && result.error ? `${MESSAGES.failed} ${result.error}` : MESSAGES[result.outcome],
    };
  } catch (error) {
    if (error instanceof OrakelStopError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
};
