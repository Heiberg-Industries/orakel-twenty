import type { OrakelSettings } from 'src/catalog/settings';
import { companyStatus, readCard } from 'src/automation/company-card';
import { fetchOwnership } from 'src/widget/card-actions';
import type { OrakelCompanyCard, OrakelFinancialYear, OwnershipData } from 'src/widget/card-types';
import type { OrakelFetch } from 'src/widget/orakel-client';
import { cleanOrgNumber } from 'src/widget/org-number';
import { CompanyAccessError, isRecordId, type TwentyCompany } from 'src/widget/twenty-company';

// Orakel as tools for Twenty's AI, and for anything that reaches Twenty over its MCP server
// (spec §7 #3). Read-only: no tool writes to Twenty or asks Orakel to do work for the company
// (no 5-year PDF reading, no website scraping, no domain proposals).
//
// Each tool takes the company as a Twenty company id or as an org number. By id, the company is
// read from Twenty first, so "Do not enrich" is honoured; by org number, Orakel is asked directly.

export type ToolInput = { companyId?: unknown; orgNumber?: unknown };

export type ToolFailure = { ok: false; message: string };

// One JSON Schema for all four tools: the AI fills one of the two.
export const TOOL_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    companyId: {
      type: 'string' as const,
      description: 'The Twenty id of the company record. Use this when you have the company in Twenty.',
    },
    orgNumber: {
      type: 'string' as const,
      description:
        'The Nordic organisation number (Norway 9 digits, Sweden 10, Denmark 8, Finland 1234567-8). Use this when you have no Twenty company id.',
    },
  },
};

export type ToolDeps = {
  readCompany: (companyId: string) => Promise<TwentyCompany>;
  fetchImpl?: OrakelFetch;
};

export const resolveToolCompany = async (
  input: ToolInput | undefined,
  readCompany: ToolDeps['readCompany'],
): Promise<{ ok: true; company: TwentyCompany } | ToolFailure> => {
  if (isRecordId(input?.companyId)) {
    try {
      return { ok: true, company: await readCompany(input.companyId) };
    } catch (error) {
      if (error instanceof CompanyAccessError) {
        return { ok: false, message: error.message };
      }
      throw error;
    }
  }
  const orgNumber = cleanOrgNumber(input?.orgNumber);
  if (orgNumber) {
    return { ok: true, company: { id: '', name: null, domain: null, orgNumber, doNotEnrich: false } };
  }
  return { ok: false, message: 'Give a Twenty company id (companyId) or an org number (orgNumber).' };
};

const withCard = async <T>(
  input: ToolInput | undefined,
  settings: OrakelSettings,
  deps: ToolDeps,
  pick: (card: OrakelCompanyCard) => T,
): Promise<({ ok: true } & T) | ToolFailure> => {
  const target = await resolveToolCompany(input, deps.readCompany);
  if (!target.ok) {
    return target;
  }
  const read = await readCard(target.company, settings, deps.fetchImpl);
  return read.ok ? { ok: true, ...pick(read.card) } : read;
};

// orakel_company_profile: the basics and up to 5 years of accounts, newest first.
export const companyProfile = (input: ToolInput | undefined, settings: OrakelSettings, deps: ToolDeps) =>
  withCard(input, settings, deps, (card) => {
    const { overview } = card;
    return {
      orgNumber: overview.orgNumber,
      companyName: overview.companyName,
      country: overview.country,
      status: companyStatus(overview),
      orgForm: overview.orgFormDescription ?? overview.orgFormCode,
      industry: overview.naceCode ? `${overview.naceCode} ${overview.naceDescription ?? ''}`.trim() : null,
      foundingDate: overview.foundingDate,
      employeeCount: overview.employeeCount,
      address: [overview.street, [overview.zip, overview.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
      municipality: overview.municipality,
      website: overview.domain,
      description: overview.description,
      // Raw amounts in the company's own currency.
      financials: (Array.isArray(card.financials) ? card.financials : []).slice(0, 5).map(
        (year): OrakelFinancialYear => ({
          year: year.year,
          revenue: year.revenue,
          operatingResult: year.operatingResult,
          netResult: year.netResult,
          totalAssets: year.totalAssets,
          totalEquity: year.totalEquity,
        }),
      ),
    };
  });

// orakel_key_people: the people in key roles, as Orakel's card lists them (without anyone who
// asked to be hidden). Names only; no contact details.
export const keyPeople = (input: ToolInput | undefined, settings: OrakelSettings, deps: ToolDeps) =>
  withCard(input, settings, deps, (card) => ({
    orgNumber: card.overview.orgNumber,
    companyName: card.overview.companyName,
    ceo: card.intelligence.ceo,
    boardChair: card.intelligence.boardChair,
    boardMembers: Array.isArray(card.intelligence.boardMembers) ? card.intelligence.boardMembers : [],
  }));

// orakel_tenders: Orakel's card carries the number of active public tenders and the latest one.
export const tenders = (input: ToolInput | undefined, settings: OrakelSettings, deps: ToolDeps) =>
  withCard(input, settings, deps, (card) => ({
    orgNumber: card.overview.orgNumber,
    companyName: card.overview.companyName,
    activeTenders: card.intelligence.activeTenders ?? 0,
    latestTender: card.intelligence.latestTenderUrl
      ? { title: card.intelligence.latestTenderTitle, url: card.intelligence.latestTenderUrl }
      : null,
  }));

// orakel_ownership: shareholders and the corporate group, as the Ownership tab shows them.
export const ownership = async (
  input: ToolInput | undefined,
  settings: OrakelSettings,
  deps: ToolDeps,
): Promise<({ ok: true; orgNumber: string } & OwnershipData) | ToolFailure> => {
  const target = await resolveToolCompany(input, deps.readCompany);
  if (!target.ok) {
    return target;
  }
  const data = await fetchOwnership(target.company, settings, deps.fetchImpl);
  if (data.unavailableMessage) {
    return { ok: false, message: data.unavailableMessage };
  }
  return { ok: true, orgNumber: target.company.orgNumber ?? '', ...data };
};
