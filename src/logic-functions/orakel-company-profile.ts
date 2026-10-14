import { defineLogicFunction } from 'twenty-sdk/define';

import { readOrakelSettings } from 'src/catalog/settings';
import { COMPANY_PROFILE_TOOL_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { companyProfile, TOOL_INPUT_SCHEMA, type ToolInput } from 'src/automation/ai-tools';
import { readCompany } from 'src/widget/twenty-company';

// AI tool, read-only: the company's basics and up to 5 years of accounts.
const handler = async (params: ToolInput) =>
  companyProfile(params, readOrakelSettings(process.env), { readCompany: (companyId) => readCompany(companyId) });

export default defineLogicFunction({
  universalIdentifier: COMPANY_PROFILE_TOOL_UNIVERSAL_IDENTIFIER,
  name: 'orakel_company_profile',
  description: 'Orakel company profile for a Nordic company: org form, industry, address, status (active, bankrupt, being dissolved), employees and up to 5 years of revenue, results, assets and equity. Read-only.',
  timeoutSeconds: 30,
  handler,
  toolTriggerSettings: {
    inputSchema: TOOL_INPUT_SCHEMA,
  },
});
