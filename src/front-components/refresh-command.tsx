import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { Command, enqueueSnackbar, useRecordId, useSelectedRecordIds } from 'twenty-sdk/front-component';

import { REFRESH_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import type { RefreshResult } from 'src/widget/refresh';
import { errorMessage } from 'src/widget/ui/widget-api';

// Behind the Refresh button in the Orakel card's header: asks the `refresh` function to re-enrich
// the open company, then says how it went.
const RefreshCommand = () => {
  const selectedRecordIds = useSelectedRecordIds();
  const legacyRecordId = useRecordId();
  const companyId = selectedRecordIds.length === 1 ? selectedRecordIds[0] : legacyRecordId;

  const execute = async () => {
    if (!companyId) {
      await enqueueSnackbar({ message: 'Open one company to refresh its Orakel data.', variant: 'warning' });
      return;
    }
    try {
      const result = await new RestApiClient().post<RefreshResult>('/s/orakel/refresh', { companyId });
      await enqueueSnackbar({ message: result.message, variant: result.ok ? 'success' : 'error' });
    } catch (error) {
      await enqueueSnackbar({
        message: errorMessage(error, 'Could not refresh the Orakel data.'),
        variant: 'error',
      });
    }
  };

  return <Command execute={execute} />;
};

export default defineFrontComponent({
  universalIdentifier: REFRESH_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'refresh-command',
  description: 'Re-fills the Orakel fields on the open company.',
  isHeadless: true,
  component: RefreshCommand,
});
