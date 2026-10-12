<!-- The shared process above the marker is generated (agent kit v0.5.3) and
     kept in step by the maintainer. Edit only below the marker. -->

# AGENTS.md

Read by every coding agent in this repo: Codex directly, Claude Code through CLAUDE.md.

## Shared process

This section is the same in every project that uses this kit and applies to every coding
agent (Claude Code, Codex or any other). The project's own section further down overrides it
where they conflict.

### Session start

Before any work, read whichever of these the project has:

1. `.claude/PROJECT.md`: the project profile. Its tracker, its path to main, its owners
   and its overriding rules.
2. `docs/SESSION_CONTEXT.md`, if it exists: resume interrupted work.
3. `docs/HANDOFF.md`: current focus, recent changes, next priorities.
4. `docs/CURRENT_STATUS.md`: what works, what is blocked.
5. `docs/solutions/`: search here first when debugging a known-hard problem.

### Working style

The owner (the person directing the work) defines what should happen; the agent
implements. Assume the owner is not a software developer.

- **Before implementing:** explain the approach in plain language and get approval.
- **After implementing:** give verification steps the owner can run.
- **On failures:** explain what went wrong in non-technical terms.
- **If unsure:** ask. Say "I'm not sure how X works. Should I investigate?"
- **Don't assume** knowledge of dev workflow, git terminology or programming concepts.
- Work reaches main by the one path the project names, for the owner and agents alike.

### Task fidelity routing

Classify every task before starting:

| Level | When | Workflow |
| --- | --- | --- |
| **F1, trivial** | Single file, clear change | Read, change, verify |
| **F2, standard** | Multi-file, follows patterns | State plan, consult rules, implement, verify |
| **F3, discovery** | Unclear scope, new patterns | Research, written plan (`docs/plans/`), get approval, implement incrementally |

If during F1 or F2 you discover larger scope, stop and re-classify. For a vague F3 request:
read the codebase first, ask clarifying questions one at a time, then propose two or three
approaches.

### Before any code edit

1. **Read** the files you are about to modify.
2. **Search** for usages of the functions and components you will change.
3. **Consult** the relevant checklist, if the project has them (F2 and F3; see the index
   below).
4. **State** your plan before editing.
5. **Verify** after editing with the project's typecheck or test command (named in the
   project section or in `.claude/kit.config.json`).

Never hardcode values that exist in config or the database. Never assume a function
signature. Never add a new file when editing an existing one works. Never guess at types.

### Proactive questions (F2 and F3)

Before implementing, raise the two or three most relevant:

- **Data:** what happens to existing data? Will old records still work?
- **Failure:** what if this fails? Is there a fallback?
- **Dependencies:** what depends on this, and what does it depend on?
- **Validation:** what prevents invalid input?
- **Edge cases:** loops, nulls, empty states, limits?

After completing, ask yourself: what was the hardest decision, what alternatives were
rejected and why, what are you least confident about?

### Session end

After significant F2 or F3 work, always, without asking:

1. Update the project's status docs (`docs/HANDOFF.md`, `docs/CURRENT_STATUS.md`) where
   they exist. Not when you work unattended from a ticket (see below).
2. Write `docs/solutions/<date>-<slug>.md` for any non-trivial problem solved.
3. Record gotchas or patterns discovered where the project keeps them.
4. Propose a new checklist if the work revealed a pattern worth enforcing.

### Two writers, one repo

Several people and agents may work in the same repo at once. Never `git add -A`; add
explicit paths. Before trusting a locally modified doc, compare it with the main branch on
the remote; a local copy can be older than main.

An agent working unattended from a ticket (started by the tracker, not by a person) never edits
`docs/HANDOFF.md`, `docs/CURRENT_STATUS.md` or `docs/SESSION_CONTEXT.md`. Every session writes
at their top, so such an edit conflicts with main, and a conflicted PR gets no CI. Put the
handoff note in the PR description; put a lesson future sessions need in a new
`docs/solutions/<date>-<slug>.md` file. The owner's sessions fold the results into the
status docs.

<!-- Project section: hand-owned. Everything below this line is kept as written. -->

## Base documentation

- Getting started:
  - https://docs.twenty.com/developers/extend/apps/getting-started/quick-start.md
  - https://docs.twenty.com/developers/extend/apps/getting-started/concepts.md
  - https://docs.twenty.com/developers/extend/apps/getting-started/project-structure.md
  - https://docs.twenty.com/developers/extend/apps/getting-started/local-server.md
  - https://docs.twenty.com/developers/extend/apps/getting-started/scaffolding.md
  - https://docs.twenty.com/developers/extend/apps/getting-started/troubleshooting.md
- Config:
  - https://docs.twenty.com/developers/extend/apps/config/overview.md
  - https://docs.twenty.com/developers/extend/apps/config/application.md
  - https://docs.twenty.com/developers/extend/apps/config/roles.md
  - https://docs.twenty.com/developers/extend/apps/config/install-hooks.md
  - https://docs.twenty.com/developers/extend/apps/config/public-assets.md
- Data:
  - https://docs.twenty.com/developers/extend/apps/data/overview.md
  - https://docs.twenty.com/developers/extend/apps/data/objects.md
  - https://docs.twenty.com/developers/extend/apps/data/extending-objects.md
  - https://docs.twenty.com/developers/extend/apps/data/relations.md
- Logic:
  - https://docs.twenty.com/developers/extend/apps/logic/overview.md
  - https://docs.twenty.com/developers/extend/apps/logic/logic-functions.md
  - https://docs.twenty.com/developers/extend/apps/logic/skills-and-agents.md
  - https://docs.twenty.com/developers/extend/apps/logic/connections.md
- Layout:
  - https://docs.twenty.com/developers/extend/apps/layout/overview.md
  - https://docs.twenty.com/developers/extend/apps/layout/views.md
  - https://docs.twenty.com/developers/extend/apps/layout/navigation-menu-items.md
  - https://docs.twenty.com/developers/extend/apps/layout/page-layouts.md
  - https://docs.twenty.com/developers/extend/apps/layout/front-components.md
  - https://docs.twenty.com/developers/extend/apps/layout/command-menu-items.md
- Operations:
  - https://docs.twenty.com/developers/extend/apps/operations/overview.md
  - https://docs.twenty.com/developers/extend/apps/operations/cli.md
  - https://docs.twenty.com/developers/extend/apps/operations/testing.md
  - https://docs.twenty.com/developers/extend/apps/operations/publishing.md
- Rich app example: https://github.com/twentyhq/twenty/tree/main/packages/twenty-apps/examples/postcard

## UUID requirement

- All generated UUIDs must be valid UUID v4.

## Common Pitfalls

- Creating a view without a navigationMenuItem associated. This will make the view available on the left sidebar.
- Creating a front-end component that has a scroll instead of being responsive to its fixed widget height and width, unless it is specifically meant to be used in a canvas tab.

## Best practice

It's highly recommended to create new app entities using `yarn twenty dev:add`. These are the options:

| Entity type          | Command                                  | Generated file                        |
| -------------------- | ---------------------------------------- | ------------------------------------- |
| Object               | `yarn twenty dev:add object`             | `src/objects/<name>.ts`               |
| Field                | `yarn twenty dev:add field`              | `src/fields/<name>.ts`                |
| Logic function       | `yarn twenty dev:add logicFunction`      | `src/logic-functions/<name>.ts`       |
| Front component      | `yarn twenty dev:add frontComponent`     | `src/front-components/<name>.tsx`     |
| Role                 | `yarn twenty dev:add role`               | `src/roles/<name>.ts`                 |
| Skill                | `yarn twenty dev:add skill`              | `src/skills/<name>.ts`                |
| Agent                | `yarn twenty dev:add agent`              | `src/agents/<name>.ts`                |
| View                 | `yarn twenty dev:add view`               | `src/views/<name>.ts`                 |
| Navigation menu item | `yarn twenty dev:add navigationMenuItem` | `src/navigation-menu-items/<name>.ts` |
| Page layout          | `yarn twenty dev:add pageLayout`         | `src/page-layouts/<name>.ts`          |
| Page layout tab      | `yarn twenty dev:add pageLayoutTab`      | `src/page-layout-tabs/<name>.ts`      |
| Command menu item    | `yarn twenty dev:add commandMenuItem`    | `src/command-menu-items/<name>.ts`    |
| View field           | `yarn twenty dev:add viewField`          | `src/view-fields/<name>.ts`           |
| Connection provider  | `yarn twenty dev:add connectionProvider` | `src/connection-providers/<name>.ts`  |

This helps automatically generate required IDs etc.

## This repo (Orakel for Twenty)

- **Path to main:** every change, the maintainer's included, goes through a pull request that must pass the
  "CI passed" check. Never push to `main` directly; the main branch ruleset refuses it.
- **An agent session started from a tracker ticket:** open the PR and stop there. Never enable auto-merge and
  never merge, not even your own docs PR. A reviewer is assigned after the PR opens; a PR that merges first is
  never reviewed.
- `twenty-sdk`, `twenty-client-sdk`, `twenty-ui` pinned to exactly 2.42.0. Never bump them automatically.
- No runtime `dependencies` in `package.json`. Everything in `devDependencies`: the build bundles it, and a runtime
  dependency makes self-hosted Twenty (LOCAL mode) install from npm on first use and after every restart.
- The Company fields come from `src/catalog/company-fields.ts`; each `src/fields/*.field.ts` file is one line.
  When Orakel's field catalog changes, refresh `src/catalog/orakel-crm-fields.snapshot.ts` first; `yarn test` says what else to change.
- Test on a throwaway local Twenty 2.42.6 (see SETUP.md), never on a real customer workspace.
