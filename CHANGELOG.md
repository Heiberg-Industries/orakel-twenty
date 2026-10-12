# Changelog

## Unreleased

- Auto-enrichment (ORA-118): `enrich-on-create` and `enrich-on-change` fill the selected `orakel*` fields when a
  company is created or gets an org number or domain. Auto-match only at a single ≥0.95 candidate. Built-ins
  (`domainName`, `address` with position, `linkedinLink`, `employees` where the workspace has it) only when empty.
- "Enrich all companies" command and a weekly run (`enrich-all`): batches of 100, paced under Twenty's rate limit,
  continues as a background job past 15 minutes, `sinceDate` for differential runs. Stops with a clear status on
  an invalid key, an expired trial or a used-up quota.

## 0.1.0

- Orakel fields on Company (`orakel*`, one per Orakel catalog field, plus `orakelDoNotEnrich`).
- Settings: API key (secret), Orakel URL, fields to fill in, card fields to hide, website sharing.
- Health check: key missing / key invalid / trial expired.
- Saved view "Orakel: no match".
