import { defineLogicFunction } from 'twenty-sdk/define';

import { readOrakelSettings } from 'src/catalog/settings';
import { TENDERS_TOOL_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { tenders, TOOL_INPUT_SCHEMA, type ToolInput } from 'src/automation/ai-tools';
import { readCompany } from 'src/widget/twenty-company';

// AI tool, read-only: active public tenders.
const handler = async (params: ToolInput) =>
  tenders(params, readOrakelSettings(process.env), { readCompany: (companyId) => readCompany(companyId) });

export default defineLogicFunction({
  universalIdentifier: TENDERS_TOOL_UNIVERSAL_IDENTIFIER,
  name: 'orakel_tenders',
  description: 'Orakel public tenders for a Nordic company: how many active tenders it has and the latest one. Read-only.',
  timeoutSeconds: 30,
  handler,
  toolTriggerSettings: {
    inputSchema: TOOL_INPUT_SCHEMA,
  },
});
