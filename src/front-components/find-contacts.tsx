import { useCallback, useEffect, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import { copyToClipboard, useRecordId, useSelectedRecordIds } from 'twenty-sdk/front-component';
import { Loader } from 'twenty-ui/primitives/feedback';
import { Button } from 'twenty-ui/primitives/input';

import { CONTACTS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import type { OrakelContacts } from 'src/widget/card-types';
import { AddPersonRow } from 'src/widget/ui/AddPerson';
import { styles } from 'src/widget/ui/styles';
import { errorMessage, findContacts } from 'src/widget/ui/widget-api';

// Behind "Find contacts" in the Orakel card's header; opens in the side panel. Orakel reads the
// company's website once, when the button is clicked. Each email address gets "+ Add".

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; contacts: OrakelContacts }
  | { status: 'failed'; message: string };

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button size="sm" variant="ghost" onClick={() => void copy()}>
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
};

const FindContacts = () => {
  const selectedRecordIds = useSelectedRecordIds();
  const legacyRecordId = useRecordId();
  const companyId = selectedRecordIds.length === 1 ? selectedRecordIds[0] : legacyRecordId;

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  const run = useCallback(async () => {
    if (!companyId) {
      return;
    }
    setLoad({ status: 'loading' });
    try {
      const result = await findContacts(companyId);
      setLoad(result.ok ? { status: 'loaded', contacts: result.contacts } : { status: 'failed', message: result.message });
    } catch (error) {
      setLoad({ status: 'failed', message: errorMessage(error, 'Could not find contacts. Try again.') });
    }
  }, [companyId]);

  useEffect(() => {
    void run();
  }, [run]);

  const body = (() => {
    if (!companyId) {
      return <p style={styles.muted}>Open one company to find its contacts.</p>;
    }
    if (load.status === 'loading') {
      return (
        <div style={styles.row}>
          <Loader />
          <span style={styles.muted}>Scanning the company's website…</span>
        </div>
      );
    }
    if (load.status === 'failed') {
      return (
        <div style={styles.section}>
          <p style={styles.error}>{load.message}</p>
          <div>
            <Button size="sm" variant="outline" onClick={() => void run()}>
              Try again
            </Button>
          </div>
        </div>
      );
    }

    const { emails, phones, noWebsite } = load.contacts;
    if (noWebsite) {
      return (
        <div style={styles.section}>
          <p style={styles.heading}>No website</p>
          <p style={styles.muted}>Orakel knows no website for this company, so there is nothing to scan.</p>
        </div>
      );
    }
    if (emails.length === 0 && phones.length === 0) {
      return <p style={styles.muted}>No email addresses or phone numbers found on the website.</p>;
    }

    return (
      <>
        {emails.length > 0 && (
          <div style={styles.section}>
            <p style={styles.heading}>Email addresses</p>
            {emails.map((email) => (
              <AddPersonRow
                key={email}
                request={{ companyId, email }}
                label={
                  <span style={styles.row}>
                    <a href={`mailto:${email}`} style={styles.link}>
                      {email}
                    </a>
                    <CopyButton text={email} />
                  </span>
                }
              />
            ))}
          </div>
        )}
        {phones.length > 0 && (
          <div style={styles.section}>
            <p style={styles.heading}>Phone numbers</p>
            {phones.map((phone) => (
              <span key={phone} style={styles.row}>
                <a href={`tel:${phone.replace(/\s+/g, '')}`} style={styles.link}>
                  {phone}
                </a>
                <CopyButton text={phone} />
              </span>
            ))}
          </div>
        )}
        <p style={styles.muted}>Found on the company's website. Check before you contact anyone.</p>
      </>
    );
  })();

  return <div style={styles.root}>{body}</div>;
};

export default defineFrontComponent({
  universalIdentifier: CONTACTS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'find-contacts',
  description: "Email addresses and phone numbers from the open company's website.",
  component: FindContacts,
});
