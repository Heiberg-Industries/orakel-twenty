import {
  definePageLayoutWidget,
  PageLayoutTabLayoutMode,
  PageLayoutWidgetVerticalListHeightBehavior,
  STANDARD_OBJECT,
  STANDARD_PAGE_LAYOUT,
} from 'twenty-sdk/define';

import {
  CARD_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  CARD_WIDGET_UNIVERSAL_IDENTIFIER,
  CONTACTS_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  REFRESH_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// The Orakel card on the Company page's Home tab, right after the built-in Fields widget (index 0).
// Fit-content height: the card grows with its content and never scrolls inside itself. The header
// carries the Find contacts and Refresh buttons.
export default definePageLayoutWidget({
  universalIdentifier: CARD_WIDGET_UNIVERSAL_IDENTIFIER,
  pageLayoutTabUniversalIdentifier: STANDARD_PAGE_LAYOUT.companyRecordPage.tabs.home.universalIdentifier,
  title: 'Orakel',
  type: 'FRONT_COMPONENT',
  objectUniversalIdentifier: STANDARD_OBJECT.company.universalIdentifier,
  position: {
    layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
    index: 1,
    heightBehavior: PageLayoutWidgetVerticalListHeightBehavior.FIT_CONTENT,
  },
  configuration: {
    configurationType: 'FRONT_COMPONENT',
    frontComponentUniversalIdentifier: CARD_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
    headerCommandMenuItemUniversalIdentifiers: [
      CONTACTS_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIER,
      REFRESH_COMMAND_MENU_ITEM_UNIVERSAL_IDENTIFIER,
    ],
  },
});
