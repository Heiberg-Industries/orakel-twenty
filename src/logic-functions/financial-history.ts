import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { readOrakelSettings } from 'src/catalog/settings';
import { FINANCIAL_HISTORY_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { fetchFinancialHistory } from 'src/widget/card-actions';
import { companyErrorResponse, errorResponse } from 'src/widget/route-errors';
import { isRecordId, readCompany } from 'src/widget/twenty-company';

// "Get 5-year history" on the Financials tab. One blocking call: Orakel's public route has no
// job to poll, and Twenty lets an app route run up to the function's own timeout. The widget then
// reloads the card to show the new years.
const handler = async (event: RoutePayload<{ companyId?: unknown }>) => {
  const companyId = event.body?.companyId;
  if (!isRecordId(companyId)) {
    return errorResponse(400, 'companyId is required.');
  }

  try {
    const company = await readCompany(companyId);
    return await fetchFinancialHistory(company, readOrakelSettings(process.env));
  } catch (error) {
    return companyErrorResponse(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: FINANCIAL_HISTORY_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'financial-history',
  description: 'Asks Orakel to read up to 5 years of annual accounts for one company.',
  timeoutSeconds: 180,
  handler,
  httpRouteTriggerSettings: {
    path: '/orakel/financial-history',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
