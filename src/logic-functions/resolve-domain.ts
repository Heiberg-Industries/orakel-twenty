import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { readOrakelSettings } from 'src/catalog/settings';
import { RESOLVE_DOMAIN_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { proposeCrmDomain } from 'src/widget/card-actions';
import { companyErrorResponse, errorResponse } from 'src/widget/route-errors';
import { isRecordId, readCompany } from 'src/widget/twenty-company';

// Domain-conflict picker, "use the website in Twenty": proposes the company's Twenty website to
// Orakel for review. Reads the company as the person who clicked, so only someone who can see the
// company can propose its website.
const handler = async (event: RoutePayload<{ companyId?: unknown }>) => {
  const companyId = event.body?.companyId;
  if (!isRecordId(companyId)) {
    return errorResponse(400, 'companyId is required.');
  }

  try {
    const company = await readCompany(companyId);
    return await proposeCrmDomain(company, readOrakelSettings(process.env));
  } catch (error) {
    return companyErrorResponse(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: RESOLVE_DOMAIN_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'resolve-domain',
  description: "Proposes a company's Twenty website to Orakel when the two disagree.",
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/orakel/resolve-domain',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
