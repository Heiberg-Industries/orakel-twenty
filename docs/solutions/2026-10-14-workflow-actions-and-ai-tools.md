# Workflow actions and AI tools in a Twenty 2.42 app

ORA-122. How Orakel's four workflow actions and four AI tools are declared, and what to know before adding more.

## What works in 2.42

- Both are settings on `defineLogicFunction`; there is no separate `define…` (ORA-114 finding 8).
  - AI tool: `toolTriggerSettings: { inputSchema }`, plain JSON Schema with `description` on each property. The
    handler gets the arguments object. Twenty lists it as `app_<function name>`, so the function `name` is the
    tool name (`orakel_company_profile` → `app_orakel_company_profile`). Twenty wraps the return value as
    `{ success, message, result }`.
  - Workflow action: `workflowActionTriggerSettings: { label, icon, inputSchema, outputSchema }`. Both schemas
    are Twenty's array format, not JSON Schema. Build the input one with `jsonSchemaToInputSchema` from
    `twenty-sdk/logic-function`. The handler gets the step's resolved input, its return value becomes the step
    result, and a thrown error fails the step.
- Exporting the result of `jsonSchemaToInputSchema` fails typecheck with TS4023 ("cannot be named"). Annotate it
  as `ReturnType<typeof jsonSchemaToInputSchema>` (`src/automation/workflow-input.ts`).

## Rules we kept

- The functions reuse existing code (`refreshCompany`, `addPerson`, `fetchCompanyCard`, `matchCompany`,
  `fetchOwnership`); `src/automation/` only adapts their results.
- AI tools only read. `src/automation/ai-tools.ts` imports the read-only `company-card.ts`, never
  `workflow-actions.ts`, which pulls in the "+ Add" writer. `src/__tests__/automation.test.ts` fails if a tool file
  mentions a writer or contact scraping.
- Business failures (no org number, opted out, Orakel said no) come back as `ok: false` + `message`, so a workflow
  can branch on them. Only a missing or unreadable company throws.
- `orakel-add-key-people` reads the card once and passes it to `addPerson` (`deps.card`), instead of `addPerson`
  reading it again per person. A suppressed person is blank on the card and is skipped as `not-listed`.

## Not verified live

No local Twenty was available when this was built. `tests/live/app.live.mts` now runs all eight through
`executeOneLogicFunction`. Running a real workflow in the editor ("Company created → Orakel: find match") is still
a manual check: the ORA-114 spike could not click "Add a step" under browser automation.
