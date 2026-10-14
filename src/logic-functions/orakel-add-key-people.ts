import { defineLogicFunction } from 'twenty-sdk/define';

import { readOrakelSettings } from 'src/catalog/settings';
import { ADD_KEY_PEOPLE_ACTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { addKeyPeople } from 'src/automation/workflow-actions';
import { COMPANY_STEP_INPUT_SCHEMA, stepCompanyId, type CompanyStepInput } from 'src/automation/workflow-input';
import { readCompany } from 'src/widget/twenty-company';

// Workflow action: creates the CEO and the board chair as Persons on the company, as the
// workflow's executing user, through the same code as "+ Add". Skips people Twenty already has,
// and people Orakel doesn't list (including anyone who asked to be hidden).
const handler = async (params: CompanyStepInput) => {
  const company = await readCompany(stepCompanyId(params));
  const result = await addKeyPeople(company, readOrakelSettings(process.env));
  return { ...result, addedCount: result.added.length, skippedCount: result.skipped.length };
};

export default defineLogicFunction({
  universalIdentifier: ADD_KEY_PEOPLE_ACTION_UNIVERSAL_IDENTIFIER,
  name: 'orakel-add-key-people',
  description: 'Workflow action: adds the CEO and board chair as people on a company, skipping duplicates.',
  timeoutSeconds: 60,
  handler,
  workflowActionTriggerSettings: {
    label: 'Orakel: add key people',
    icon: 'IconUserPlus',
    inputSchema: COMPANY_STEP_INPUT_SCHEMA,
    outputSchema: [
      {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
          addedCount: { type: 'number' },
          skippedCount: { type: 'number' },
          added: { type: 'array' },
          skipped: { type: 'array' },
        },
      },
    ],
  },
});
