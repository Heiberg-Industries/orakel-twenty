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
`yarn twenty docker:start` (that starts the latest dev image). Run the server, worker, Postgres 16 and Redis 7
containers with `SERVER_URL=http://localhost:3000`, `IS_MULTIWORKSPACE_ENABLED=false`, `STORAGE_TYPE=local` and
`LOGIC_FUNCTION_TYPE=LOCAL`, sign up with any email, then create an API key under Settings → APIs.

```bash
yarn twenty remote:add --url http://localhost:3000 --api-key "$TOKEN" --as local
yarn twenty remote:use local
yarn twenty app:publish --private
yarn twenty app:install
```

Bump `version` in `package.json` to publish an upgrade. Tear down with `yarn twenty app:uninstall -y`.
