import { useCallback, useEffect, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, navigate, useRecordId, useSelectedRecordIds } from 'twenty-sdk/front-component';
import { Loader } from 'twenty-ui/primitives/feedback';
import { Button } from 'twenty-ui/primitives/input';

import { CARD_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import type { CardState } from 'src/widget/card-types';
import { FinancialsTab } from 'src/widget/ui/FinancialsTab';
import { MatchSuggestions } from 'src/widget/ui/MatchSuggestions';
import { OverviewTab } from 'src/widget/ui/OverviewTab';
import { styles } from 'src/widget/ui/styles';
import { errorMessage, fetchCard } from 'src/widget/ui/widget-api';

// The Orakel card on the Company page: a port of the HubSpot card (orakel
// `hubspot-extension/src/app/cards/OrakelCard.jsx`) with its Overview and Financials tabs.
// Everything Orakel-related goes through the app's logic functions; this component holds no key.

type LoadState = { status: 'loading' } | { status: 'loaded'; card: CardState } | { status: 'failed'; message: string };

type Tab = 'overview' | 'financials';

const openAppSettings = () => navigate(AppPath.SettingsCatchAll, { '*': 'applications' });

const Message = ({ title, children }: { title: string; children?: React.ReactNode }) => (
  <div style={styles.section}>
    <p style={styles.heading}>{title}</p>
    {children}
  </div>
);

const SettingsButton = () => (
  <div>
    <Button size="sm" variant="outline" onClick={openAppSettings}>
      Open app settings
    </Button>
  </div>
);

const ExternalLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" style={styles.link}>
    {children}
  </a>
);

const OrakelCard = () => {
  const [selectedRecordId] = useSelectedRecordIds();
  const legacyRecordId = useRecordId();
  const companyId = selectedRecordId ?? legacyRecordId ?? null;

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [tab, setTab] = useState<Tab>('overview');

  const reload = useCallback(async () => {
    if (!companyId) {
      return;
    }
    setLoad({ status: 'loading' });
    try {
      setLoad({ status: 'loaded', card: await fetchCard(companyId) });
    } catch (error) {
      setLoad({ status: 'failed', message: errorMessage(error, 'Could not load Orakel data. Try again.') });
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const retry = (
    <div>
      <Button size="sm" variant="outline" onClick={() => void reload()}>
        Try again
      </Button>
    </div>
  );

  const body = (() => {
    if (!companyId) {
      return <p style={styles.muted}>Open a company to see its Orakel data.</p>;
    }
    if (load.status === 'loading') {
      return (
        <div style={styles.row}>
          <Loader />
          <span style={styles.muted}>Loading Orakel data…</span>
        </div>
      );
    }
    if (load.status === 'failed') {
      return (
        <Message title="Could not load Orakel data">
          <p style={styles.error}>{load.message}</p>
          {retry}
        </Message>
      );
    }

    const card = load.card;
    switch (card.state) {
      case 'opted-out':
        return (
          <Message title="Orakel is off for this company">
            <p style={styles.muted}>"Do not enrich" is on, so Orakel leaves this company alone. Turn it off to see Orakel data.</p>
          </Message>
        );
      case 'no-key':
        return (
          <Message title="Connect Orakel">
            <p style={styles.muted}>
              No Orakel API key is set. A workspace admin can paste one under Settings → Applications → Orakel.
            </p>
            <SettingsButton />
          </Message>
        );
      case 'key-problem':
        return (
          <Message title={card.reason === 'no-account' ? 'Orakel key has no account' : 'Orakel key not accepted'}>
            <p style={styles.muted}>
              {card.reason === 'no-account'
                ? 'This Orakel API key is not linked to an Orakel account. Create a key from your account at orakel.cloud.'
                : 'Orakel does not recognise the API key. It may have been revoked. A workspace admin can paste a current key.'}
            </p>
            <SettingsButton />
          </Message>
        );
      case 'payment-required':
        return (
          <Message title={card.trialExpired ? 'Your Orakel trial has expired' : 'Orakel access is paused'}>
            <p style={styles.muted}>
              <ExternalLink href={card.upgradeUrl}>{card.trialExpired ? 'Upgrade' : 'Add payment'}</ExternalLink> to keep
              seeing company data here.
            </p>
          </Message>
        );
      case 'rate-limited':
        return (
          <Message title="Orakel usage limit reached">
            <p style={styles.muted}>{card.message}</p>
            {retry}
          </Message>
        );
      case 'not-matched':
        return (
          <MatchSuggestions
            companyId={companyId}
            suggestions={card.suggestions}
            searchedName={card.searchedName}
            onMatched={() => void reload()}
          />
        );
      case 'not-in-orakel':
        return (
          <Message title="Not in Orakel">
            <p style={styles.muted}>
              Orakel has no company with org number {card.orgNumber}. Check the Org number field.
            </p>
          </Message>
        );
      case 'error':
        return (
          <Message title="Could not load Orakel data">
            <p style={styles.error}>{card.message}</p>
            {retry}
          </Message>
        );
      case 'ready':
        return (
          <>
            <div style={styles.tabBar} role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'overview'} style={styles.tab(tab === 'overview')} onClick={() => setTab('overview')}>
                Overview
              </button>
              <button type="button" role="tab" aria-selected={tab === 'financials'} style={styles.tab(tab === 'financials')} onClick={() => setTab('financials')}>
                Financials
              </button>
            </div>
            {tab === 'overview' ? (
              <OverviewTab
                key={card.card.overview.orgNumber}
                companyId={companyId}
                overview={card.card.overview}
                hiddenCardFields={card.hiddenCardFields}
                orakelDomain={card.orakelDomain}
                crmDomain={card.crmDomain}
              />
            ) : (
              <FinancialsTab companyId={companyId} card={card.card} onHistoryLoaded={() => void reload()} />
            )}
          </>
        );
    }
  })();

  return <div style={styles.root}>{body}</div>;
};

export default defineFrontComponent({
  universalIdentifier: CARD_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'orakel-card',
  description: 'Orakel company card: overview, financials and match suggestions.',
  component: OrakelCard,
});
