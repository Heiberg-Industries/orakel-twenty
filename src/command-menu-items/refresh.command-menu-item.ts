import { CommandMenuItemAvailabilityType, defineCommandMenuItem, STANDARD_OBJECT } from 'twenty-sdk/define';

import {
  REFRESH_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  REFRESH_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// "Refresh" in the Orakel card's header (and in the command menu on an open company).
export default defineCommandMenuItem({
  universalIdentifier: REFRESH_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  label: 'Refresh Orakel data',
  shortLabel: 'Refresh',
  availabilityType: CommandMenuItemAvailabilityType.RECORD_SELECTION,
  availabilityObjectUniversalIdentifier: STANDARD_OBJECT.company.universalIdentifier,
  frontComponentUniversalIdentifier: REFRESH_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
