import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { readOrakelSettings } from 'src/catalog/settings';
import { ADD_PERSON_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { addPerson, type AddPersonInput } from 'src/widget/people';
import { companyErrorResponse, errorResponse } from 'src/widget/route-errors';
import { isRecordId, readCompany } from 'src/widget/twenty-company';

// "+ Add" on the People tab and in Find contacts: creates a Person linked to the company, as the
// person who clicked. Checks Twenty for the same email, then the same name, first.
const handler = async (
  event: RoutePayload<{ companyId?: unknown; name?: unknown; email?: unknown; force?: unknown }>,
) => {
  const body = event.body ?? {};
  if (!isRecordId(body.companyId)) {
    return errorResponse(400, 'companyId is required.');
  }

  const force = body.force === true;
  let input: AddPersonInput;
  if (typeof body.email === 'string' && body.email.trim() !== '') {
    input = { email: body.email, force };
  } else if (typeof body.name === 'string' && body.name.trim() !== '') {
    input = { name: body.name, force };
  } else {
    return errorResponse(400, 'A name or an email address is required.');
  }

  try {
    const company = await readCompany(body.companyId);
    return await addPerson(company, input, readOrakelSettings(process.env));
  } catch (error) {
    return companyErrorResponse(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: ADD_PERSON_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'add-person',
  description: 'Creates a Person on one company from the Orakel card, with a note saying where it came from.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/orakel/add-person',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
