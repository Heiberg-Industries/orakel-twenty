import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { SET_ORG_NUMBER_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import type { SetOrgNumberResult } from 'src/widget/card-types';
import { cleanOrgNumber } from 'src/widget/org-number';
import { companyErrorResponse, errorResponse } from 'src/widget/route-errors';
import { isRecordId, readCompany, writeOrgNumber } from 'src/widget/twenty-company';

// "Use this" on a match suggestion: sets `orakelOrgNumber` on the company, as the person who
// clicked, so Twenty's own permissions decide whether they may. Setting the number is what starts
// enrichment of the other Orakel fields.
const handler = async (event: RoutePayload<{ companyId?: unknown; orgNumber?: unknown }>) => {
  const companyId = event.body?.companyId;
  const orgNumber = cleanOrgNumber(event.body?.orgNumber);

  if (!isRecordId(companyId)) {
    return errorResponse(400, 'companyId is required.');
  }
  if (!orgNumber) {
    return errorResponse(400, 'That is not an org number.');
  }

  try {
    const company = await readCompany(companyId);
    if (company.doNotEnrich) {
      return errorResponse(409, 'Orakel is turned off for this company ("Do not enrich").');
    }
    await writeOrgNumber(companyId, orgNumber);
  } catch (error) {
    return companyErrorResponse(error);
  }

  const result: SetOrgNumberResult = { ok: true, orgNumber };
  return result;
};

export default defineLogicFunction({
  universalIdentifier: SET_ORG_NUMBER_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'set-org-number',
  description: 'Sets the Orakel org number on a company, as the person who clicked "Use this".',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/orakel/set-org-number',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
