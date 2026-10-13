import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { readOrakelSettings } from 'src/catalog/settings';
import { CONTACTS_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { findContacts } from 'src/widget/card-actions';
import { companyErrorResponse, errorResponse } from 'src/widget/route-errors';
import { isRecordId, readCompany } from 'src/widget/twenty-company';

// "Find contacts" in the Orakel card's header: email addresses and phone numbers on the company's
// own website. Only ever one company, on a click; never in bulk.
const handler = async (event: RoutePayload<{ companyId?: unknown }>) => {
  const companyId = event.body?.companyId;
  if (!isRecordId(companyId)) {
    return errorResponse(400, 'companyId is required.');
  }

  try {
    const company = await readCompany(companyId);
    return await findContacts(company, readOrakelSettings(process.env));
  } catch (error) {
    return companyErrorResponse(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: CONTACTS_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'contacts',
  description: "Finds email addresses and phone numbers on one company's website.",
  timeoutSeconds: 90,
  handler,
  httpRouteTriggerSettings: {
    path: '/orakel/contacts',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
