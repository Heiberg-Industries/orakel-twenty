# Changelog

## Unreleased

- Auto-enrichment ([ORA-118](https://linear.app/heiberg-industries/issue/ORA-118), [#3](https://github.com/Heiberg-Industries/orakel-twenty/pull/3)): `enrich-on-create` and `enrich-on-change` fill the selected `orakel*` fields when a
  company is created or gets an org number or domain. Auto-match only at a single ≥0.95 candidate. Built-ins
  (`domainName`, `address` with position, `linkedinLink`, `employees` where the workspace has it) only when empty.
- "Enrich all companies" command and a weekly run (`enrich-all`): batches of 100, paced under Twenty's rate limit,
  continues as a background job past 15 minutes, `sinceDate` for differential runs. Stops with a clear status on
  an invalid key, an expired trial or a used-up quota.
- Orakel card on the Company page ([ORA-119](https://linear.app/heiberg-industries/issue/ORA-119)): a widget on the
  Home tab with Overview (copy org number, bankrupt / being dissolved tags, hidden card fields, website conflict
  picker) and Financials (5-year table, "Get 5-year history" for Norwegian companies). Without an org number it
  shows up to 3 suggestions; "Use this" sets `orakelOrgNumber` as the person who clicked. Separate states for
  opted out, no key, key problems, not in Orakel, usage limit and payment required (with the upgrade link).
  Refresh in the card header re-enriches the company. Routes: `card`, `set-org-number`, `financial-history`,
  `resolve-domain`, `refresh`.

## 0.1.0

- Orakel fields on Company (`orakel*`, one per Orakel catalog field, plus `orakelDoNotEnrich`).
- Settings: API key (secret), Orakel URL, fields to fill in, card fields to hide, website sharing.
- Health check: key missing / key invalid / trial expired.
- Saved view "Orakel: no match".
