import { jsonSchemaToInputSchema } from 'twenty-sdk/logic-function';

import { isRecordId } from 'src/widget/twenty-company';

// What every Orakel workflow action takes: the company, by its Twenty id (for example
// `{{trigger.object.id}}` in a "Company created" workflow).
export const COMPANY_STEP_INPUT_SCHEMA: ReturnType<typeof jsonSchemaToInputSchema> = jsonSchemaToInputSchema({
  type: 'object',
  properties: {
    companyId: { type: 'string', label: 'Company ID' },
  },
  required: ['companyId'],
});

export type CompanyStepInput = { companyId?: unknown };

// A thrown error becomes the workflow step's error: the step can't run without a company.
export const stepCompanyId = (params: CompanyStepInput | undefined): string => {
  if (!isRecordId(params?.companyId)) {
    throw new Error('Company ID must be the id of a Twenty company.');
  }
  return params.companyId;
};
