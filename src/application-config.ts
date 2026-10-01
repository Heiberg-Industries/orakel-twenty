import { defineApplication, FieldType } from 'twenty-sdk/define';

import {
  DEFAULT_FIELD_SELECTION,
  DEFAULT_ORAKEL_BASE_URL,
  HIDEABLE_CARD_FIELD_OPTIONS,
  ORAKEL_FIELD_OPTIONS,
} from 'src/catalog/settings';
import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  ORAKEL_API_KEY_VARIABLE_UNIVERSAL_IDENTIFIER,
  ORAKEL_BASE_URL_VARIABLE_UNIVERSAL_IDENTIFIER,
  ORAKEL_CONTRIBUTE_DOMAINS_VARIABLE_UNIVERSAL_IDENTIFIER,
  ORAKEL_FIELDS_VARIABLE_UNIVERSAL_IDENTIFIER,
  ORAKEL_HIDDEN_CARD_FIELDS_VARIABLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  author: 'Heiberg Industries',
  category: 'Enrichment',
  websiteUrl: 'https://orakel.cloud',
  issueReportUrl: 'https://github.com/Heiberg-Industries/orakel-twenty/issues',
  applicationVariables: {
    // Not `isRequired`: the health check reports a missing key itself, as one of its three states.
    ORAKEL_API_KEY: {
      universalIdentifier: ORAKEL_API_KEY_VARIABLE_UNIVERSAL_IDENTIFIER,
      label: 'Orakel API key',
      description: 'Your Orakel API key (orakel_…). Create one at orakel.cloud under Account.',
      type: FieldType.TEXT,
      isSecret: true,
    },
    ORAKEL_BASE_URL: {
      universalIdentifier: ORAKEL_BASE_URL_VARIABLE_UNIVERSAL_IDENTIFIER,
      label: 'Orakel URL',
      description: `Leave as ${DEFAULT_ORAKEL_BASE_URL} unless you were given another address.`,
      type: FieldType.TEXT,
      value: DEFAULT_ORAKEL_BASE_URL,
    },
    ORAKEL_FIELDS: {
      universalIdentifier: ORAKEL_FIELDS_VARIABLE_UNIVERSAL_IDENTIFIER,
      label: 'Fields to fill in',
      description:
        'Which Orakel fields the app writes on each company. Org number is always written. Unselected fields stay empty.',
      type: FieldType.MULTI_SELECT,
      options: ORAKEL_FIELD_OPTIONS,
      value: DEFAULT_FIELD_SELECTION,
    },
    ORAKEL_HIDDEN_CARD_FIELDS: {
      universalIdentifier: ORAKEL_HIDDEN_CARD_FIELDS_VARIABLE_UNIVERSAL_IDENTIFIER,
      label: 'Hide on the company card',
      description: 'Details to leave out of the Orakel card on the company page.',
      type: FieldType.MULTI_SELECT,
      options: HIDEABLE_CARD_FIELD_OPTIONS,
      value: [],
    },
    ORAKEL_CONTRIBUTE_DOMAINS: {
      universalIdentifier: ORAKEL_CONTRIBUTE_DOMAINS_VARIABLE_UNIVERSAL_IDENTIFIER,
      label: 'Share company websites with Orakel',
      description:
        "Send each matched company's website to Orakel for review, to improve matching for everyone. Never written to Orakel directly.",
      type: FieldType.BOOLEAN,
      value: true,
    },
  },
});
