# Setup

## Prerequisites

- Node.js (version in `.nvmrc`), Yarn 4 (`corepack enable`), Docker.

## Checks

```bash
yarn install
yarn lint
yarn typecheck
yarn test      # unit tests, no server needed
yarn build     # builds the manifest and functions into .twenty/output
```

## Try it on a throwaway local Twenty

Use the same Twenty version as production (`twentycrm/twenty:v2.42.6`, `LOGIC_FUNCTION_TYPE=LOCAL`), not
`yarn twenty docker:start` (that starts the latest dev image). Heiberg's recipe:
orbis `docs/solutions/2026-10-01-test-a-twenty-app-on-a-throwaway-local-twenty.md`.

```bash
yarn twenty remote:add --url http://localhost:3000 --api-key "$TOKEN" --as local
yarn twenty remote:use local
yarn twenty app:publish --private
yarn twenty app:install
```

Bump `version` in `package.json` to publish an upgrade. Tear down with `yarn twenty app:uninstall -y`.
