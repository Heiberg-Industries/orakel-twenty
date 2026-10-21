# Changelog

## 0.2.0

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
- People tab and Find contacts ([ORA-120](https://linear.app/heiberg-industries/issue/ORA-120)): CEO, board chair
  and members, active tenders and tech stack. "+ Add" (`add-person`, as the person who clicked) checks Twenty for
  the same email, then the same name, offers "Open" / "Create anyway", creates a Person linked to the company and
  adds a note "Added from Orakel: <source>, <date>". It only creates people Orakel's card lists right now, so a
  suppressed person can't be created. "Find contacts" in the card header (`contacts`) opens a side panel with the
  website's emails and phones, each email with "+ Add", and a "No website" state.
- Ownership tab ([ORA-121](https://linear.app/heiberg-industries/issue/ORA-121), [#7](https://github.com/Heiberg-Industries/orakel-twenty/pull/7)): shows the latest corporate
  shareholder list with ownership percentages and the company's corporate group. The API key stays on the server;
  shareholder and group lookups run only when the tab opens. Personal shareholders are excluded by the API default.
- Orakel in Twenty workflows and Twenty AI ([ORA-122](https://linear.app/heiberg-industries/issue/ORA-122), [#8](https://github.com/Heiberg-Industries/orakel-twenty/pull/8)): four
  workflow actions (`orakel-find-match`, `orakel-company-health`, `orakel-enrich-company`, `orakel-add-key-people`)
  and four read-only AI tools (`orakel_company_profile`, `orakel_ownership`, `orakel_key_people`, `orakel_tenders`).
  The actions reuse Refresh and "+ Add"; key people skips duplicates and suppressed roles and adds the source note.
  No contact scraping in workflows or AI. The live sweep runs all eight.
- Live acceptance sweep ([ORA-124](https://linear.app/heiberg-industries/issue/ORA-124), [#6](https://github.com/Heiberg-Industries/orakel-twenty/pull/6)):
  `yarn tsx tests/live/app.live.mts` runs every logic function against a real Twenty and the real Orakel, checks
  that wrong or ambiguous matches are never written and real ones are at least suggested, and covers revoked and
  expired-trial keys. Run by hand, never in `yarn test`. Adds `tsx` as a dev dependency.
- Ownership fields from Orakel's summary ([ORA-256](https://linear.app/heiberg-industries/issue/ORA-256)): majority
  owner, largest shareholder, subsidiary and parent company now read `ownership.topHolders` (the ten largest
  holders of the latest year). Orakel's company lookup and batch enrich no longer return the raw `shareholders` list.

## 0.1.0

- Orakel fields on Company (`orakel*`, one per Orakel catalog field, plus `orakelDoNotEnrich`).
- Settings: API key (secret), Orakel URL, fields to fill in, card fields to hide, website sharing.
- Health check: key missing / key invalid / trial expired.
- Saved view "Orakel: no match".
