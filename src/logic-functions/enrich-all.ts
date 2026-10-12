import { defineLogicFunction } from 'twenty-sdk/define';
import { enqueueJobs } from 'twenty-sdk/logic-function';

import { checkOrakelKey } from 'src/catalog/orakel-key-status';
import { readOrakelSettings } from 'src/catalog/settings';
import { ENRICH_ALL_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import {
  buttonState,
  CONTINUATION_DELAY_MS,
  isEnrichAllState,
  parseSinceDate,
  runEnrichAll,
  weeklyState,
  type EnrichAllState,
} from 'src/enrichment/enrich-all';

// One function, three ways in:
//   - `POST /s/enrich-all` (the "Enrich all companies" button), optional body `{ sinceDate }`:
//     checks the Orakel key, queues the run as a background job and answers at once.
//   - the weekly cron (Mondays 03:00 UTC): runs right away, differential.
//   - a background job carrying `{ enrichAll: state }`: the run itself, or its next part.

const enqueue = async (state: EnrichAllState, delayMs: number) => {
  const result = await enqueueJobs({
    logicFunctionUniversalIdentifier: ENRICH_ALL_UNIVERSAL_IDENTIFIER,
    payloads: [{ enrichAll: state }],
    delayMs,
    retryLimit: 0,
  });
  if (!result.enqueued) throw new Error('Twenty did not queue the job');
};

const deps = () => ({
  env: process.env,
  now: () => Date.now(),
  enqueue: (state: EnrichAllState) => enqueue(state, CONTINUATION_DELAY_MS),
});

const handler = async (payload: Record<string, unknown> | undefined) => {
  const event = payload ?? {};

  if (isEnrichAllState(event.enrichAll)) {
    return runEnrichAll(event.enrichAll, deps());
  }

  // HTTP route: the payload carries the request (`body`, `headers`, `requestContext`).
  if ('requestContext' in event || 'headers' in event || 'body' in event) {
    const body = (typeof event.body === 'object' && event.body !== null ? event.body : {}) as Record<string, unknown>;
    const sinceDate = parseSinceDate(body.sinceDate);
    if (sinceDate === 'invalid') {
      return { started: false, message: 'sinceDate must be a date, for example 2026-10-01.' };
    }

    // Not billed by Orakel: tells the user now, rather than in the logs, that the key won't work.
    const keyStatus = await checkOrakelKey(readOrakelSettings(process.env));
    if (keyStatus.status === 'ERROR') {
      return { started: false, message: `${keyStatus.title}. ${keyStatus.description}` };
    }

    try {
      await enqueue(buttonState(sinceDate), 0);
    } catch (error) {
      console.error(`[orakel] enrich-all could not start: ${error instanceof Error ? error.message : String(error)}`);
      return { started: false, message: 'Twenty could not start the enrichment run. Try again in a minute.' };
    }
    return {
      started: true,
      message: 'Enriching all companies in the background. Large workspaces take a few minutes per 1,000 companies.',
    };
  }

  // Cron.
  return runEnrichAll(weeklyState(Date.now()), deps());
};

export default defineLogicFunction({
  universalIdentifier: ENRICH_ALL_UNIVERSAL_IDENTIFIER,
  name: 'enrich-all',
  description: 'Fills the Orakel fields on every company. Started by the "Enrich all companies" button and weekly.',
  timeoutSeconds: 900,
  httpRouteTriggerSettings: {
    path: '/enrich-all',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  cronTriggerSettings: {
    pattern: '0 3 * * 1',
  },
  handler,
});
