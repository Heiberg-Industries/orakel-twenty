import { useState } from 'react';
import { AppPath, navigate } from 'twenty-sdk/front-component';
import { Button } from 'twenty-ui/primitives/input';

import type { AddPersonRequest, PersonMatch } from 'src/widget/card-types';
import { styles } from 'src/widget/ui/styles';
import { addPerson, errorMessage } from 'src/widget/ui/widget-api';

// "+ Add" next to a person or an email address. The server checks Twenty first (email, then name)
// and creates nothing when it finds a match: the person then picks "Open" or, for a name match,
// "Create anyway".

type AddState =
  | { step: 'idle' }
  | { step: 'working' }
  | { step: 'duplicates'; duplicates: PersonMatch[]; canForce: boolean }
  | { step: 'created'; personId: string; warning?: string }
  | { step: 'failed'; message: string };

const openPerson = (personId: string) =>
  navigate(AppPath.RecordShowPage, { objectNameSingular: 'person', objectRecordId: personId });

type AddPersonProps = { request: AddPersonRequest; label: React.ReactNode };

export const AddPersonRow = ({ request, label }: AddPersonProps) => {
  const [state, setState] = useState<AddState>({ step: 'idle' });

  const add = async (force: boolean) => {
    setState({ step: 'working' });
    try {
      const result = await addPerson({ ...request, force });
      if (result.ok) {
        setState({ step: 'created', personId: result.personId, warning: result.noteError });
      } else if ('duplicates' in result) {
        setState({ step: 'duplicates', duplicates: result.duplicates, canForce: result.matchedBy === 'name' });
      } else {
        setState({ step: 'failed', message: result.message });
      }
    } catch (error) {
      setState({ step: 'failed', message: errorMessage(error, 'Could not add this person. Try again.') });
    }
  };

  return (
    <div style={styles.section}>
      <div style={styles.personRow}>
        <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label}</div>
        {(state.step === 'idle' || state.step === 'working' || state.step === 'failed') && (
          <Button
            size="sm"
            variant="outline"
            loading={state.step === 'working'}
            disabled={state.step === 'working'}
            onClick={() => void add(false)}
          >
            {state.step === 'failed' ? 'Retry' : '+ Add'}
          </Button>
        )}
        {state.step === 'created' && (
          <Button size="sm" variant="ghost" onClick={() => void openPerson(state.personId)}>
            Open
          </Button>
        )}
      </div>

      {state.step === 'failed' && <p style={styles.error}>{state.message}</p>}
      {state.step === 'created' && state.warning && <p style={styles.error}>{state.warning}</p>}

      {state.step === 'duplicates' && (
        <div style={styles.duplicateBox}>
          <p style={styles.muted}>Already in Twenty:</p>
          {state.duplicates.map((duplicate) => (
            <div key={duplicate.id} style={styles.personRow}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{duplicate.name}</span>
              <Button size="sm" variant="outline" onClick={() => void openPerson(duplicate.id)}>
                Open
              </Button>
            </div>
          ))}
          <div style={styles.row}>
            {state.canForce && (
              <Button size="sm" variant="outline" onClick={() => void add(true)}>
                Create anyway
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setState({ step: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
