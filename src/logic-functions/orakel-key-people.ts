import { defineLogicFunction } from 'twenty-sdk/define';

import { readOrakelSettings } from 'src/catalog/settings';
import { KEY_PEOPLE_TOOL_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { keyPeople, TOOL_INPUT_SCHEMA, type ToolInput } from 'src/automation/ai-tools';
import { readCompany } from 'src/widget/twenty-company';

// AI tool, read-only: the CEO, board chair and board members.
const handler = async (params: ToolInput) =>
  keyPeople(params, readOrakelSettings(process.env), { readCompany: (companyId) => readCompany(companyId) });

export default defineLogicFunction({
  universalIdentifier: KEY_PEOPLE_TOOL_UNIVERSAL_IDENTIFIER,
  name: 'orakel_key_people',
  description: 'Orakel key people for a Nordic company: the CEO, the board chair and the board members from the company register. Names only. Read-only.',
  timeoutSeconds: 30,
  handler,
  toolTriggerSettings: {
    inputSchema: TOOL_INPUT_SCHEMA,
  },
});
