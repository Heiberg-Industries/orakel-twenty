import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { ENRICH_ON_CHANGE_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { runOnChange, WATCHED_FIELDS, type CompanyEvent } from 'src/enrichment/on-change';

// A company got (or changed) its org number or domain: re-enrich it.
//
// Watches only `orakelOrgNumber` and `domainName`. The app's own writes can change those two as
// well (a matched org number, a domain filled in when empty), but together with app-only `orakel*`
// fields, and `companiesToEnrich` drops such updates, so the function doesn't loop on itself.
export default defineLogicFunction({
  universalIdentifier: ENRICH_ON_CHANGE_UNIVERSAL_IDENTIFIER,
  name: 'enrich-on-change',
  description: 'Re-fills the Orakel fields when a company gets a new org number or domain.',
  timeoutSeconds: 900,
  databaseEventTriggerSettings: {
    eventName: 'company.updated',
    updatedFields: WATCHED_FIELDS,
    batchMode: true,
  },
  handler: async (payload: DatabaseEventBatchPayload<CompanyEvent>) =>
    runOnChange(payload.events, { env: process.env }),
});
