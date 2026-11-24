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
import { OwnershipTab } from 'src/widget/ui/OwnershipTab';
import { PeopleTab } from 'src/widget/ui/PeopleTab';
import { colors, styles } from 'src/widget/ui/styles';
import { errorMessage, fetchCard } from 'src/widget/ui/widget-api';

// The Orakel card on the Company page: a port of the HubSpot card (orakel
// `hubspot-extension/src/app/cards/OrakelCard.jsx`) with its Overview, Financials and People tabs.
// Everything Orakel-related goes through the app's logic functions; this component holds no key.

type LoadState = { status: 'loading' } | { status: 'loaded'; card: CardState } | { status: 'failed'; message: string };

type Tab = 'overview' | 'financials' | 'people' | 'ownership';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'financials', label: 'Financials' },
  { id: 'people', label: 'People' },
  { id: 'ownership', label: 'Ownership' },
];

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

// The «o.» mark from public/logo.svg without its tile: the «o» takes the text colour, so it follows
// light and dark mode; the dot is always amber.
const OrakelMark = () => (
  <svg viewBox="12 20 56 40" width={20} height={14} style={styles.mark} aria-hidden="true">
    <path
      fill="currentColor"
      d="M31.8 55.7Q34.9 55.7 37.3 54.2Q39.7 52.7 41 49.5Q42.3 46.3 42.3 41.3Q42.3 35.7 41.1 31.9Q39.8 28.2 37.4 26.2Q35 24.3 31.6 24.3Q28.5 24.3 26.2 25.8Q23.8 27.3 22.4 30.5Q21.1 33.7 21.1 38.8Q21.1 44.3 22.4 48.1Q23.7 51.9 26.1 53.8Q28.5 55.7 31.8 55.7ZM31.5 60Q25.6 60 21.2 57.5Q16.8 55.1 14.4 50.6Q12 46.2 12 40.4Q12 34.4 14.5 29.8Q17.1 25.2 21.6 22.6Q26.1 20 32 20Q37.9 20 42.3 22.5Q46.7 25 49.1 29.4Q51.5 33.8 51.5 39.6Q51.5 45.6 49 50.2Q46.4 54.8 41.9 57.4Q37.4 60 31.5 60Z"
    />
    <circle cx="61.5" cy="53.5" r="6.5" fill={colors.accent} />
  </svg>
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
              {TABS.map(({ id, label }) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} style={styles.tab(tab === id)} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
              <OrakelMark />
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
            ) : tab === 'financials' ? (
              <FinancialsTab companyId={companyId} card={card.card} onHistoryLoaded={() => void reload()} />
            ) : tab === 'people' ? (
              <PeopleTab key={card.card.overview.orgNumber} companyId={companyId} intelligence={card.card.intelligence} />
            ) : (
              <OwnershipTab key={card.card.overview.orgNumber} companyId={companyId} />
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
  description: 'Orakel company card: overview, financials, people and match suggestions.',
  component: OrakelCard,
});
