import { Response } from 'twenty-sdk/logic-function';

import { CompanyAccessError } from 'src/widget/twenty-company';

// Error answers for the widget's routes. The widget shows `error` to the person as written.

export const errorResponse = (status: number, message: string) =>
  new Response({ error: message }, { status, headers: { 'content-type': 'application/json' } });

export const companyErrorResponse = (error: unknown) => {
  if (error instanceof CompanyAccessError) {
    return errorResponse(error.status, error.message);
  }
  throw error;
};
