import { defineLogicFunction } from 'twenty-sdk/define';

import { ENRICH_COMPANY_ACTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { COMPANY_STEP_INPUT_SCHEMA, stepCompanyId, type CompanyStepInput } from 'src/automation/workflow-input';
import { refreshCompany } from 'src/widget/refresh';
import { readCompanyRecord } from 'src/widget/twenty-company';

// Workflow action: re-fills the selected `orakel*` fields on one company, with the same steps as
// the card's Refresh button and enrich-on-change. The company is read as the workflow's executing
// user; the write uses the app's access, because only the app may write the `orakel*` fields.
const handler = async (params: CompanyStepInput) => {
  const record = await readCompanyRecord(stepCompanyId(params));
  const result = await refreshCompany(record, { env: process.env });
  return { ok: result.ok, outcome: result.outcome ?? 'failed', message: result.message };
};

export default defineLogicFunction({
  universalIdentifier: ENRICH_COMPANY_ACTION_UNIVERSAL_IDENTIFIER,
  name: 'orakel-enrich-company',
  description: 'Workflow action: fills the selected Orakel fields on one company.',
  timeoutSeconds: 60,
  handler,
  workflowActionTriggerSettings: {
    label: 'Orakel: enrich company',
    icon: 'IconRefresh',
    inputSchema: COMPANY_STEP_INPUT_SCHEMA,
    outputSchema: [
      {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          outcome: { type: 'string' },
          message: { type: 'string' },
        },
      },
    ],
  },
});
