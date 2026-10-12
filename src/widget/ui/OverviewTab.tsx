import { useState } from 'react';
import { copyToClipboard } from 'twenty-sdk/front-component';
import { Tag } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';

import type { OrakelCompanyCard } from 'src/widget/card-types';
import { addressLine, foundingYear, industryLine, legalFormLine, truncate, websiteView } from 'src/widget/format';
import { styles } from 'src/widget/ui/styles';
import { errorMessage, proposeCrmWebsite } from 'src/widget/ui/widget-api';

type OverviewTabProps = {
  companyId: string;
  overview: OrakelCompanyCard['overview'];
  hiddenCardFields: string[];
  orakelDomain: string | null;
  crmDomain: string | null;
};

const Item = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <>
    <dt style={styles.label}>{label}</dt>
    <dd style={styles.value}>{children}</dd>
  </>
);

// The person's pick in the website conflict is kept on this device only, keyed by both websites,
// so it comes back if either website changes. Storage may be missing in the sandbox; then the pick
// lasts until the page reloads, as on the HubSpot card.
const pickKey = (companyId: string, orakelDomain: string, crmDomain: string) =>
  `orakel:website-pick:${companyId}:${orakelDomain}:${crmDomain}`;

const readPick = (key: string | null) => {
  if (!key) {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const savePick = (key: string, domain: string) => {
  try {
    localStorage.setItem(key, domain);
  } catch {
    // not persisted; the in-memory pick still applies
  }
};

export const OverviewTab = ({ companyId, overview, hiddenCardFields, orakelDomain, crmDomain }: OverviewTabProps) => {
  const storageKey = orakelDomain && crmDomain ? pickKey(companyId, orakelDomain, crmDomain) : null;

  const [copied, setCopied] = useState(false);
  const [pickedDomain, setPickedDomain] = useState<string | null>(() => readPick(storageKey));
  const [choosing, setChoosing] = useState(false);
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [websiteMessage, setWebsiteMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const { displayDomain, conflict } = websiteView(orakelDomain, crmDomain, pickedDomain);
  const isHidden = (field: string) => hiddenCardFields.includes(field);

  const address = isHidden('address') ? null : addressLine(overview);
  const municipality = isHidden('municipality') ? null : overview.municipality;
  const phone = isHidden('phone') ? null : overview.phone;
  const legalForm = legalFormLine(overview);
  const founded = foundingYear(overview.foundingDate);
  const industry = industryLine(overview);

  const copyOrgNumber = async () => {
    await copyToClipboard(overview.orgNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pick = (domain: string) => {
    setPickedDomain(domain);
    setChoosing(false);
    if (storageKey) {
      savePick(storageKey, domain);
    }
  };

  const chooseCrmWebsite = async (domain: string) => {
    setSavingWebsite(true);
    setWebsiteMessage(null);
    try {
      const result = await proposeCrmWebsite(companyId);
      if (!result.ok) {
        setWebsiteMessage({ text: result.message, isError: true });
        return;
      }
      pick(domain);
      if (result.queued) {
        setWebsiteMessage({ text: 'Sent to Orakel for review.', isError: false });
      } else if (result.skipped === 'sharing-off') {
        setWebsiteMessage({ text: 'Website sharing is off in the app settings, so Orakel was not told.', isError: false });
      }
    } catch (error) {
      setWebsiteMessage({ text: errorMessage(error, 'Could not save the website. Try again.'), isError: true });
    } finally {
      setSavingWebsite(false);
    }
  };

  return (
    <div style={styles.section}>
      {(overview.isBankrupt || overview.isBeingDissolved) && (
        <div style={styles.row}>
          {overview.isBankrupt && <Tag color="red">Bankrupt</Tag>}
          {overview.isBeingDissolved && <Tag color="orange">Being dissolved</Tag>}
        </div>
      )}

      <dl style={styles.list}>
        <Item label="Org number">
          <span style={styles.row}>
            {overview.orgNumber}
            <Button size="sm" variant="ghost" onClick={copyOrgNumber}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </span>
        </Item>
        {legalForm && <Item label="Legal form">{legalForm}</Item>}
        {founded && <Item label="Founded">{founded}</Item>}
        {industry && <Item label="Industry">{industry}</Item>}
        {overview.employeeCount !== null && <Item label="Employees">{String(overview.employeeCount)}</Item>}
        {overview.description && <Item label="Activity">{truncate(overview.description, 160)}</Item>}
        {address && <Item label="Address">{address}</Item>}
        {municipality && <Item label="Municipality">{municipality}</Item>}
        {phone && <Item label="Phone">{phone}</Item>}
        {displayDomain && (
          <Item label={conflict ? 'Website ⚠' : 'Website'}>
            <a href={`https://${displayDomain}`} target="_blank" rel="noreferrer" style={styles.link}>
              {displayDomain}
            </a>
          </Item>
        )}
      </dl>

      {conflict && !choosing && (
        <div style={styles.row}>
          <span style={styles.muted}>Orakel and Twenty have different websites.</span>
          <Button size="sm" variant="outline" onClick={() => setChoosing(true)}>
            Resolve
          </Button>
        </div>
      )}
      {conflict && choosing && (
        <div style={styles.section}>
          <p style={styles.muted}>Which website is right for this company?</p>
          <div style={styles.row}>
            <Button size="sm" variant="outline" disabled={savingWebsite} onClick={() => pick(conflict.orakelDomain)}>
              {`${conflict.orakelDomain} (Orakel)`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={savingWebsite}
              disabled={savingWebsite}
              onClick={() => chooseCrmWebsite(conflict.crmDomain)}
            >
              {`${conflict.crmDomain} (Twenty)`}
            </Button>
          </div>
        </div>
      )}
      {websiteMessage && <p style={websiteMessage.isError ? styles.error : styles.muted}>{websiteMessage.text}</p>}
    </div>
  );
};
