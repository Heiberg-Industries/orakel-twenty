# Orakel for Twenty

Nordic company data from [Orakel](https://orakel.cloud) on every company in your Twenty CRM: registry facts
(org number, legal form, industry, employees), the latest accounts, key people, ownership and public tenders.

## What it does today (v0.1)

- Adds the Orakel fields to **Company**, all prefixed `orakel` (for example *Org number*, *Revenue*, *CEO name*).
  The app fills them; you can set *Org number* and *Do not enrich* yourself.
- Adds a saved view, **Orakel: no match**, listing companies without an org number.
- Checks your Orakel key on the app's settings page and tells you if it is missing, invalid, or on an expired trial.
- **Fills the fields on its own.** When a company is created, or gets an org number or a new domain, the app
  fetches it from Orakel (or matches it by name and domain; only a near-certain match is written) and fills the
  selected fields. Built-in fields (domain, address, LinkedIn, employees) are filled only when empty, and nothing
  you entered yourself is changed or cleared. Tick *Do not enrich* on a company to leave it alone.
- **Enrich all companies**: a command on the Companies list fills every existing company, and a weekly run keeps
  them current. Progress and counts are in the `enrich-all` function's logs.

- **Orakel card on each company page** (Home tab): Overview and Financials from Orakel, the 5-year accounts on
  request, and a Refresh button in the card header. A company without an org number shows up to three
  suggestions; click *Use this* on the right one. If Twenty and Orakel have different websites, the card asks
  which is right and can send Twenty's to Orakel for review.
- **People tab** on the card: the CEO, board chair and board members, active public tenders and the website's tech
  stack. *+ Add* creates the person in Twenty, linked to the company. It first looks for the same email, then the
  same name, and offers *Open* or *Create anyway*. Each person added this way gets a note "Added from Orakel:
  <source>, <date>". People who asked Orakel to hide them are never shown and can't be added.
- **Find contacts** in the card header (Norwegian companies): reads the company's own website once, when you click,
  and lists the email addresses and phone numbers on it, each address with *+ Add*.

## Settings

| Setting | What it does |
|---|---|
| Orakel API key | Your own key from orakel.cloud. Stored encrypted; only the app's server code reads it. |
| Orakel URL | Leave as `https://orakel.cloud`. |
| Fields to fill in | Which Orakel fields are written. Org number is always written. |
| Hide on the company card | Leave address, municipality or phone off the card. |
| Share company websites with Orakel | Sends matched websites to Orakel for review. On by default. |

## Before you install

- **Twenty 2.42 or newer.**
- **Self-hosted Twenty:** apps only run with `LOGIC_FUNCTION_TYPE=LOCAL`. In that mode app code runs inside your
  Twenty server and can read its environment (database URL, secrets). Install only apps you trust.
- **Uninstalling deletes data.** Removing the app permanently deletes every Orakel field it added, including org
  numbers. Orakel can re-match most companies after a reinstall, but org numbers you typed in by hand are lost.

## Development

See [SETUP.md](SETUP.md). Rules for this repo:

- `twenty-sdk`, `twenty-client-sdk` and `twenty-ui` stay pinned at exactly `2.42.0` and are upgraded by hand.
- No runtime `dependencies`. Everything goes in `devDependencies`; the build bundles it into each function.
  A runtime dependency makes self-hosted Twenty download packages from npm on first use and after every restart.
- Test on a throwaway local Twenty, never on a customer workspace.

### Live acceptance sweep

`yarn test` only checks what we believe Twenty and Orakel do. The live sweep checks it against the real systems
and is the acceptance bar. It is never part of `yarn test`: it creates and deletes companies and people, and every
Orakel call is billed.

```bash
ORAKEL_API_KEY=orakel_… TWENTY_URL=http://localhost:3000 TWENTY_API_KEY=… yarn tsx tests/live/app.live.mts
```

- Run it against a throwaway Twenty with the app installed (see [SETUP.md](SETUP.md)), the same Orakel key in the
  app's settings and the default field selection. It takes about ten minutes.
- **Part A** asks Orakel directly, using the app's own code: the health check for each kind of key, the card's
  upgrade and key-problem states, and the match for each test company in `tests/live/app.fixtures.mts`.
- **Part B** works inside Twenty: it creates the test companies, waits for the app to match them, then calls every
  function (card, Use this, refresh, 5-year history, website review, Find contacts, + Add, enrich all, weekly run,
  health check) and removes what it created (`SWEEP_KEEP=1` keeps it).
- **Both directions:** a wrong or ambiguous match is never written on its own (too eager), and a real company is at
  least suggested (too strict).
- **Key problems:** set `ORAKEL_REVOKED_KEY` and `ORAKEL_EXPIRED_TRIAL_KEY` for Part A. To check the workspace
  itself, put a revoked or expired-trial key in the app's settings and run with
  `SWEEP_WORKSPACE_KEY_STATE=revoked` (or `expired-trial`): the health check must go red and the card must show the
  upgrade or key message, not a blank widget.
- Other options are listed at the top of the script. Each row prints `PASS`, `FAIL` or `SKIP`; any `SKIP` means it
  was not a full acceptance run. Paste the output into the ticket.

MIT licensed.
