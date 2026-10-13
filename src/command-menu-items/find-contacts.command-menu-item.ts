import { CommandMenuItemAvailabilityType, defineCommandMenuItem, STANDARD_OBJECT } from 'twenty-sdk/define';

import {
  CONTACTS_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  CONTACTS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// "Find contacts" in the Orakel card's header (and in the command menu on an open company). Its
// component is not headless, so Twenty opens it in the side panel.
export default defineCommandMenuItem({
  universalIdentifier: CONTACTS_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  label: 'Find contacts on website',
  shortLabel: 'Find contacts',
  availabilityType: CommandMenuItemAvailabilityType.RECORD_SELECTION,
  availabilityObjectUniversalIdentifier: STANDARD_OBJECT.company.universalIdentifier,
  frontComponentUniversalIdentifier: CONTACTS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
});
