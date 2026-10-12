import { CommandMenuItemAvailabilityType, defineCommandMenuItem, STANDARD_OBJECT } from 'twenty-sdk/define';

import {
  ENRICH_ALL_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  ENRICH_ALL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// "Enrich all companies" in the command menu, while the Companies list is open.
export default defineCommandMenuItem({
  universalIdentifier: ENRICH_ALL_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  label: 'Enrich all companies with Orakel',
  shortLabel: 'Enrich all',
  availabilityType: CommandMenuItemAvailabilityType.GLOBAL_OBJECT_CONTEXT,
  availabilityObjectUniversalIdentifier: STANDARD_OBJECT.company.universalIdentifier,
  frontComponentUniversalIdentifier: ENRICH_ALL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
