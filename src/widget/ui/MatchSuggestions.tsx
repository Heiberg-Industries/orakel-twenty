import { useState } from 'react';
import { Button } from 'twenty-ui/primitives/input';

import type { OrakelMatchCandidate } from 'src/widget/card-types';
import { styles } from 'src/widget/ui/styles';
import { errorMessage, setOrgNumber } from 'src/widget/ui/widget-api';

type MatchSuggestionsProps = {
  companyId: string;
  suggestions: OrakelMatchCandidate[];
  searchedName: string | null;
  onMatched: () => void;
};

// No org number yet: up to 3 of Orakel's best guesses. "Use this" sets the org number; nothing is
// written until a person picks one.
export const MatchSuggestions = ({ companyId, suggestions, searchedName, onMatched }: MatchSuggestionsProps) => {
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ orgNumber: string; message: string } | null>(null);

  const use = async (orgNumber: string) => {
    setSaving(orgNumber);
    setFailed(null);
    try {
      await setOrgNumber(companyId, orgNumber);
      onMatched();
    } catch (error) {
      setFailed({ orgNumber, message: errorMessage(error, 'Could not set the org number. Try again.') });
    } finally {
      setSaving(null);
    }
  };

  if (suggestions.length === 0) {
    return (
      <div style={styles.section}>
        <p style={styles.heading}>No org number</p>
        <p style={styles.muted}>
          {searchedName
            ? `Orakel found no company matching "${searchedName}". Set the Org number field by hand to connect it.`
            : 'Give the company a name or a website, or set the Org number field by hand to connect it.'}
        </p>
      </div>
    );
  }

  return (
    <div style={styles.section}>
      <p style={styles.heading}>No org number</p>
      <p style={styles.muted}>Possible matches. Pick the right one to connect this company:</p>
      {suggestions.map((suggestion) => {
        const details = [suggestion.city, suggestion.orgFormCode, suggestion.orgNumber].filter(Boolean).join(' · ');
        const isSaving = saving === suggestion.orgNumber;

        return (
          <div key={suggestion.orgNumber} style={styles.suggestion}>
            <div style={{ minWidth: 0 }}>
              <p style={{ ...styles.heading, overflowWrap: 'anywhere' }}>{suggestion.name}</p>
              <p style={styles.muted}>{details}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              loading={isSaving}
              disabled={saving !== null}
              onClick={() => use(suggestion.orgNumber)}
            >
              {failed?.orgNumber === suggestion.orgNumber ? 'Retry' : 'Use this'}
            </Button>
          </div>
        );
      })}
      {failed && <p style={styles.error}>{failed.message}</p>}
      <p style={styles.muted}>Not listed? Set the Org number field by hand.</p>
    </div>
  );
};
