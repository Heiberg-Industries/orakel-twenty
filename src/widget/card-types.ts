// Shapes shared by the card logic functions and the Company widget. Type-only: the widget bundle
// must not pull in server code.

// `GET /api/companies/{org}/card`, from Orakel's `buildCompanyCard` (lib/crm/card.ts), read
// 2026-10-12. Financials are raw amounts in the company's currency, newest year first, at most 5.
export type OrakelCompanyCard = {
  overview: {
    orgNumber: string;
    companyName: string;
    orgFormCode: string | null;
    orgFormDescription: string | null;
    naceCode: string | null;
    naceDescription: string | null;
    foundingDate: string | null;
    employeeCount: number | null;
    street: string | null;
    zip: string | null;
    city: string | null;
    municipality: string | null;
    domain: string | null;
    country: string;
    phone: string | null;
    description: string | null;
    isBankrupt: boolean | null;
    isBeingDissolved: boolean | null;
  };
  financials: OrakelFinancialYear[];
  pdfYearCount: number;
  intelligence: {
    ceo: string | null;
    boardChair: string | null;
    boardMembers: string[];
    activeTenders: number;
    latestTenderUrl: string | null;
    latestTenderTitle: string | null;
    technologies: string[];
  };
};

export type OrakelFinancialYear = {
  year: number;
  revenue: number | null;
  operatingResult: number | null;
  netResult: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
};

// `GET /api/companies/match`: at most 3, best first.
export type OrakelMatchCandidate = {
  orgNumber: string;
  name: string;
  city: string | null;
  orgFormCode: string | null;
  confidence: number;
  matchedBy: string;
};

// What the `card` route returns to the widget: always HTTP 200 with one of these states.
export type CardState =
  | { state: 'opted-out' }
  | { state: 'no-key' }
  | { state: 'key-problem'; reason: 'invalid-key' | 'no-account' }
  | { state: 'payment-required'; trialExpired: boolean; upgradeUrl: string }
  | { state: 'rate-limited'; message: string }
  | { state: 'not-matched'; suggestions: OrakelMatchCandidate[]; searchedName: string | null }
  | { state: 'not-in-orakel'; orgNumber: string }
  | {
      state: 'ready';
      card: OrakelCompanyCard;
      hiddenCardFields: string[];
      // Both websites as bare hosts (`normalizeDomain`), for the domain-conflict picker.
      orakelDomain: string | null;
      crmDomain: string | null;
    }
  | { state: 'error'; message: string };

export type SetOrgNumberResult = { ok: true; orgNumber: string };

export type FinancialHistoryResult =
  | { ok: true; extractedYears: number }
  | { ok: false; message: string };

export type ShareholderRow = {
  shareholderName?: string | null;
  shareholderOrgNumber?: string | null;
  shareClass?: string | null;
  ownershipPct: number;
  year?: number;
};

export type OwnershipGroupNode = {
  orgNumber: string;
  name: string;
  children: OwnershipGroupNode[];
};

export type OwnershipData = {
  shareholders: { data: ShareholderRow[]; availableYears: number[] } | null;
  group: { root: OwnershipGroupNode; totalMembers: number; message?: string } | null;
  shareholdersError: string | null;
  groupError: string | null;
  unavailableMessage?: string;
};

// `GET /api/companies/{org}/contacts`: what Orakel found on the company's own website, scraped
// once, on this click. Norwegian companies only; `noWebsite` when Orakel knows no website for it.
export type OrakelContacts = { emails: string[]; phones: string[]; noWebsite?: boolean };

export type ContactsResult = { ok: true; contacts: OrakelContacts } | { ok: false; message: string };

// "+ Add" on the People tab (a registry role, by name) or in Find contacts (an email address).
// `force` is "Create anyway" after a name match.
export type AddPersonRequest =
  | { companyId: string; name: string; force?: boolean }
  | { companyId: string; email: string; force?: boolean };

export type PersonMatch = { id: string; name: string };

// `duplicates`: Twenty already has this person; nothing was created. A name match can be
// overridden with `force`; an email match can't, because Twenty keeps email addresses unique.
// `noteError`: the Person exists, but its source note could not be written.
export type AddPersonResult =
  | { ok: true; personId: string; noteError?: string }
  | { ok: false; duplicates: PersonMatch[]; matchedBy: 'email' | 'name' }
  | { ok: false; message: string };

export type ResolveDomainResult =
  | { ok: true; queued: boolean; skipped?: 'sharing-off' | 'not-norwegian' }
  | { ok: false; message: string };
