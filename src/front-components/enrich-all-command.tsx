import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { Command, enqueueSnackbar } from 'twenty-sdk/front-component';

import { ENRICH_ALL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

// Behind the "Enrich all companies" command: asks the `enrich-all` function to start, then says so.
// The run itself happens in the background; its counts are in the function logs.

type StartResult = { started?: boolean; message?: string };

const EnrichAllCommand = () => {
  const execute = async () => {
    try {
      const result = await new RestApiClient().post<StartResult>('/s/enrich-all', {});
      await enqueueSnackbar({
        message: result?.message ?? 'Enrichment started.',
        variant: result?.started === false ? 'error' : 'success',
      });
    } catch (error) {
      await enqueueSnackbar({
        message: 'Could not start the Orakel enrichment.',
        detailedMessage: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    }
  };

  return <Command execute={execute} />;
};

export default defineFrontComponent({
  universalIdentifier: ENRICH_ALL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'enrich-all-command',
  description: 'Starts filling the Orakel fields on every company.',
  isHeadless: true,
  component: EnrichAllCommand,
});
