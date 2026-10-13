import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { readOrakelSettings } from 'src/catalog/settings';
import { CARD_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { loadCardState } from 'src/widget/load-card';
import { companyErrorResponse, errorResponse } from 'src/widget/route-errors';
import { isRecordId, readCompany } from 'src/widget/twenty-company';

// Everything the Company widget shows, as one state: the Orakel card when the company has an org
// number, match suggestions when it has none, or why neither is available.
const handler = async (event: RoutePayload) => {
  const companyId = event.queryStringParameters?.companyId;
  if (!isRecordId(companyId)) {
    return errorResponse(400, 'companyId is required.');
  }

  try {
    const company = await readCompany(companyId);
    return await loadCardState(company, readOrakelSettings(process.env));
  } catch (error) {
    return companyErrorResponse(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: CARD_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'card',
  description: 'Orakel card for one company: overview, financials, or match suggestions.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/orakel/card',
    httpMethod: 'GET',
    isAuthRequired: true,
  },
});
