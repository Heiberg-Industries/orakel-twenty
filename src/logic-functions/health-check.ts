import { defineHealthCheck } from 'twenty-sdk/define';

import { checkOrakelKey } from 'src/catalog/orakel-key-status';
import { readOrakelSettings } from 'src/catalog/settings';
import { HEALTH_CHECK_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineHealthCheck({
  universalIdentifier: HEALTH_CHECK_UNIVERSAL_IDENTIFIER,
  name: 'health-check',
  timeoutSeconds: 30,
  handler: async () => checkOrakelKey(readOrakelSettings(process.env)),
});
