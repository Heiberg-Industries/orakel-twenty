# Orakel for Twenty

Nordic company data from [Orakel](https://orakel.cloud) on every company in your Twenty CRM: registry facts
(org number, legal form, industry, employees), the latest accounts, key people, ownership and public tenders.

## What it does today (v0.1)

- Adds the Orakel fields to **Company**, all prefixed `orakel` (for example *Org number*, *Revenue*, *CEO name*).
  The app fills them; you can set *Org number* and *Do not enrich* yourself.
- Adds a saved view, **Orakel: no match**, listing companies without an org number.
- Checks your Orakel key on the app's settings page and tells you if it is missing, invalid, or on an expired trial.

Automatic enrichment and the company card come in the next releases.

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

MIT licensed.
