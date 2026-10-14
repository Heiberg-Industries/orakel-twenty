import { defineLogicFunction } from 'twenty-sdk/define';

import { readOrakelSettings } from 'src/catalog/settings';
import { COMPANY_HEALTH_ACTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { companyHealth } from 'src/automation/workflow-actions';
import { COMPANY_STEP_INPUT_SCHEMA, stepCompanyId, type CompanyStepInput } from 'src/automation/workflow-input';
import { readCompany } from 'src/widget/twenty-company';

// Workflow action: active, bankrupt or being dissolved, and the latest year's revenue and result.
// Read-only.
const handler = async (params: CompanyStepInput) => {
  const company = await readCompany(stepCompanyId(params));
  return companyHealth(company, readOrakelSettings(process.env));
};

export default defineLogicFunction({
  universalIdentifier: COMPANY_HEALTH_ACTION_UNIVERSAL_IDENTIFIER,
  name: 'orakel-company-health',
  description: 'Workflow action: whether a company is active, bankrupt or being dissolved, with its latest revenue and result.',
  timeoutSeconds: 30,
  handler,
  workflowActionTriggerSettings: {
    label: 'Orakel: company health',
    icon: 'IconHeartbeat',
    inputSchema: COMPANY_STEP_INPUT_SCHEMA,
    outputSchema: [
      {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
          orgNumber: { type: 'string' },
          companyName: { type: 'string' },
          status: { type: 'string', enum: ['active', 'bankrupt', 'being-dissolved'] },
          isBankrupt: { type: 'boolean' },
          isBeingDissolved: { type: 'boolean' },
          latestYear: { type: 'number' },
          revenue: { type: 'number' },
          operatingResult: { type: 'number' },
          netResult: { type: 'number' },
        },
      },
    ],
  },
});
