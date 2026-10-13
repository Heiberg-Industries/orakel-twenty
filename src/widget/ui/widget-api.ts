import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';

import type {
  AddPersonRequest,
  AddPersonResult,
  CardState,
  ContactsResult,
  FinancialHistoryResult,
  ResolveDomainResult,
  SetOrgNumberResult,
} from 'src/widget/card-types';

// The widget's calls to the app's own routes (`src/logic-functions/*`). They run as the person
// looking at the page; the Orakel key stays on the server.

const client = () => new RestApiClient();

export const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof RestApiClientError) {
    const body = error.body as { error?: unknown } | undefined;
    if (typeof body?.error === 'string' && body.error.trim() !== '') {
      return body.error;
    }
  }
  return fallback;
};

export const fetchCard = (companyId: string) =>
  client().get<CardState>('/s/orakel/card', { query: { companyId } });

export const setOrgNumber = (companyId: string, orgNumber: string) =>
  client().post<SetOrgNumberResult>('/s/orakel/set-org-number', { companyId, orgNumber });

export const requestFinancialHistory = (companyId: string) =>
  client().post<FinancialHistoryResult>('/s/orakel/financial-history', { companyId });

export const findContacts = (companyId: string) =>
  client().post<ContactsResult>('/s/orakel/contacts', { companyId });

export const addPerson = (request: AddPersonRequest) => client().post<AddPersonResult>('/s/orakel/add-person', request);

export const proposeCrmWebsite = (companyId: string) =>
  client().post<ResolveDomainResult>('/s/orakel/resolve-domain', { companyId });
