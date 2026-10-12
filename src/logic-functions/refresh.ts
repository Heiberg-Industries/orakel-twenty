import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { REFRESH_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { refreshCompany } from 'src/widget/refresh';
import { companyErrorResponse, errorResponse } from 'src/widget/route-errors';
import { isRecordId, readCompanyRecord } from 'src/widget/twenty-company';

// "Refresh" in the Orakel card's header: re-enriches this company now.
const handler = async (event: RoutePayload<{ companyId?: unknown }>) => {
  const companyId = event.body?.companyId;
  if (!isRecordId(companyId)) {
    return errorResponse(400, 'companyId is required.');
  }

  try {
    // Read as the person who clicked: someone who can't see the company can't refresh it.
    const record = await readCompanyRecord(companyId);
    return await refreshCompany(record, { env: process.env });
  } catch (error) {
    return companyErrorResponse(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: REFRESH_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'refresh',
  description: 'Re-fills the Orakel fields on one company now.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: {
    path: '/orakel/refresh',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
