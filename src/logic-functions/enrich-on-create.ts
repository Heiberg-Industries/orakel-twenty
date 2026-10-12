import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { ENRICH_ON_CREATE_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { runOnChange, type CompanyEvent } from 'src/enrichment/on-change';

// A new company: match it (or fetch it, if it came with an org number) and fill the Orakel fields.
// Same handling as enrich-on-change; Twenty declares one event per function.
export default defineLogicFunction({
  universalIdentifier: ENRICH_ON_CREATE_UNIVERSAL_IDENTIFIER,
  name: 'enrich-on-create',
  description: 'Fills the Orakel fields on new companies.',
  timeoutSeconds: 900,
  databaseEventTriggerSettings: {
    eventName: 'company.created',
    batchMode: true,
  },
  handler: async (payload: DatabaseEventBatchPayload<CompanyEvent>) =>
    runOnChange(payload.events, { env: process.env }),
});
