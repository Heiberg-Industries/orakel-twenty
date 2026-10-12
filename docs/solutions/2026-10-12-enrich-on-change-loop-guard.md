# enrich-on-change must not trigger itself

**Context:** ORA-118. `enrich-on-change` runs on `company.updated` filtered to `orakelOrgNumber` and `domainName`.
The function itself may write both: the org number of an auto-match, and `domainName` when it was empty.

**Rule used:** an update whose `updatedFields` contains any `orakel*` field with writability `APPLICATION` came from
the app, because neither users nor API keys can write those fields. Such events are dropped
(`src/enrichment/on-change.ts`, `APP_WRITTEN_FIELD_NAMES` in `company-patch.ts`).

Backstops:

- The write leaves out every value the record already holds, so a re-run on an unchanged company sends no PATCH
  and fires no event.
- Built-ins are only filled when empty, so a second pass never writes `domainName` again.

**Unverified on a live 2.42.6 (check in the live sweep, ORA-124):** whether `updatedFields` lists only fields whose
value changed, or every key in the PATCH body. If it lists every key, the rule above still holds; the backstops
just do less.

**Also decided here:** if a user clears `orakelOrgNumber`, the function does not match again (it would write the
same, unwanted number straight back). Ticking *Do not enrich* remains the way to stop enrichment for good.
