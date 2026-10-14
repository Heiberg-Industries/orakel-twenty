import { defineLogicFunction } from 'twenty-sdk/define';

import { readOrakelSettings } from 'src/catalog/settings';
import { FIND_MATCH_ACTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { findMatch } from 'src/automation/workflow-actions';
import { COMPANY_STEP_INPUT_SCHEMA, stepCompanyId, type CompanyStepInput } from 'src/automation/workflow-input';
import { readCompany } from 'src/widget/twenty-company';

// Workflow action: Orakel's best match for a company (org number, name, confidence) by its name and
// website. Never writes; a workflow can set the org number itself, for example at ≥0.95.
const handler = async (params: CompanyStepInput) => {
  const company = await readCompany(stepCompanyId(params));
  return findMatch(company, readOrakelSettings(process.env));
};

export default defineLogicFunction({
  universalIdentifier: FIND_MATCH_ACTION_UNIVERSAL_IDENTIFIER,
  name: 'orakel-find-match',
  description: "Workflow action: Orakel's best match for a company, with its org number and confidence. Does not write.",
  timeoutSeconds: 30,
  handler,
  workflowActionTriggerSettings: {
    label: 'Orakel: find match',
    icon: 'IconSearch',
    inputSchema: COMPANY_STEP_INPUT_SCHEMA,
    outputSchema: [
      {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
          found: { type: 'boolean' },
          alreadySet: { type: 'boolean' },
          orgNumber: { type: 'string' },
          name: { type: 'string' },
          confidence: { type: 'number' },
          matchedBy: { type: 'string' },
          candidates: { type: 'array' },
        },
      },
    ],
  },
});
