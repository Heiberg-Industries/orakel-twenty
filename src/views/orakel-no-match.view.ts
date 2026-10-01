import { defineView, STANDARD_OBJECT, ViewFilterOperand } from 'twenty-sdk/define';

import { getCompanyFieldEntry } from 'src/catalog/company-fields';
import {
  NO_MATCH_VIEW_FIELD_DO_NOT_ENRICH_UNIVERSAL_IDENTIFIER,
  NO_MATCH_VIEW_FIELD_DOMAIN_UNIVERSAL_IDENTIFIER,
  NO_MATCH_VIEW_FIELD_NAME_UNIVERSAL_IDENTIFIER,
  NO_MATCH_VIEW_FIELD_ORG_NUMBER_UNIVERSAL_IDENTIFIER,
  NO_MATCH_VIEW_FILTER_UNIVERSAL_IDENTIFIER,
  NO_MATCH_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Companies Orakel has not matched yet (no org number). Replaces orakel's
// `lib/twenty/unmatched-report.ts`; the per-company suggestions live in the widget (ORA-119).
const company = STANDARD_OBJECT.company;
const orgNumberField = getCompanyFieldEntry('orgNumber').universalIdentifier;

export default defineView({
  universalIdentifier: NO_MATCH_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Orakel: no match',
  objectUniversalIdentifier: company.universalIdentifier,
  icon: 'IconBuildingOff',
  fields: [
    { universalIdentifier: NO_MATCH_VIEW_FIELD_NAME_UNIVERSAL_IDENTIFIER, fieldMetadataUniversalIdentifier: company.fields.name.universalIdentifier, position: 0, isVisible: true },
    { universalIdentifier: NO_MATCH_VIEW_FIELD_DOMAIN_UNIVERSAL_IDENTIFIER, fieldMetadataUniversalIdentifier: company.fields.domainName.universalIdentifier, position: 1, isVisible: true },
    { universalIdentifier: NO_MATCH_VIEW_FIELD_ORG_NUMBER_UNIVERSAL_IDENTIFIER, fieldMetadataUniversalIdentifier: orgNumberField, position: 2, isVisible: true },
    { universalIdentifier: NO_MATCH_VIEW_FIELD_DO_NOT_ENRICH_UNIVERSAL_IDENTIFIER, fieldMetadataUniversalIdentifier: getCompanyFieldEntry('doNotEnrich').universalIdentifier, position: 3, isVisible: true },
  ],
  filters: [
    {
      universalIdentifier: NO_MATCH_VIEW_FILTER_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: orgNumberField,
      operand: ViewFilterOperand.IS_EMPTY,
      value: '',
    },
  ],
});
