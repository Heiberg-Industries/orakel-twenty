import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { readOrakelSettings } from 'src/catalog/settings';
import { OWNERSHIP_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { fetchOwnership } from 'src/widget/card-actions';
import { companyErrorResponse, errorResponse } from 'src/widget/route-errors';
import { CompanyAccessError, isRecordId, readCompany } from 'src/widget/twenty-company';

const handler = async (event: RoutePayload<{ companyId?: unknown }>) => {
  const companyId = event.body?.companyId;
  if (!isRecordId(companyId)) {
    return errorResponse(400, 'companyId is required.');
  }

  try {
    const company = await readCompany(companyId);
    return await fetchOwnership(company, readOrakelSettings(process.env));
  } catch (error) {
    if (error instanceof CompanyAccessError) {
      return companyErrorResponse(error);
    }
    return errorResponse(400, error instanceof Error ? error.message : 'Could not load ownership data.');
  }
};

export default defineLogicFunction({
  universalIdentifier: OWNERSHIP_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'ownership',
  description: 'Gets shareholder and corporate group information for one company.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/orakel/ownership',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
