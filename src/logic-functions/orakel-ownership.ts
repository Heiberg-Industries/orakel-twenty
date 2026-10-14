import { defineLogicFunction } from 'twenty-sdk/define';

import { readOrakelSettings } from 'src/catalog/settings';
import { OWNERSHIP_TOOL_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { ownership, TOOL_INPUT_SCHEMA, type ToolInput } from 'src/automation/ai-tools';
import { readCompany } from 'src/widget/twenty-company';

// AI tool, read-only: shareholders and the corporate group.
const handler = async (params: ToolInput) =>
  ownership(params, readOrakelSettings(process.env), { readCompany: (companyId) => readCompany(companyId) });

export default defineLogicFunction({
  universalIdentifier: OWNERSHIP_TOOL_UNIVERSAL_IDENTIFIER,
  name: 'orakel_ownership',
  description: 'Orakel ownership for a Norwegian company: corporate shareholders with ownership percentages, and the corporate group it belongs to. Read-only.',
  timeoutSeconds: 30,
  handler,
  toolTriggerSettings: {
    inputSchema: TOOL_INPUT_SCHEMA,
  },
});
