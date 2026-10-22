---
name: trunk-based
description: How changes reach production in this repo - trunk-based development (one main branch, short-lived branches, main always releasable), feature flags (the FEATURES setting) that keep unfinished features off in production, the prod-* tags that mark each production deploy, and how to release a feature or hotfix production. Use before starting a feature that takes more than one PR, when adding, switching on or removing a feature flag, when asked what production runs, and when production needs a fix but main has changes that aren't ready.
---

# Trunk-based development

There is one long-lived branch, `main`. Every change is a short-lived `feature/`, `bugfix/` or `hotfix/` branch merged into it through a pull request (the `feature-branch` skill), usually within a day or two. There is no `develop` branch and no release branches.

**`main` is always releasable.** Merging deploys staging; production is deployed from `main` by hand whenever the user decides (the `deploy` skill). Anything merged must therefore be fine in production as it is. A feature that takes several PRs merges each of them **switched off in production** behind a feature flag, so production never waits on unfinished work and a fix never has to wait behind it.

The frontend (`../everise-frontend`) works the same way, with its own flags in its environment files. A feature that spans both repos gets a flag of the same name in each.

## Feature flags

`FEATURES` (`src/config.ts`) lists the features switched on in a deployment, comma-separated. `FEATURES` in `config.ts` names every feature that can be switched, and the setting is checked against it at start-up (an unknown name stops the Worker from starting).

| Where | Value |
| --- | --- |
| `wrangler.jsonc`, staging `vars` | every feature being built (`planner`) |
| `wrangler.jsonc`, top-level `vars` (production) | only the released ones (`""` today) |
| `__tests__/utils/env.ts` | every feature, so the tests and `openapi.json` cover them all |
| `.dev.vars` (local) | whatever you are working on |

`config.features` (and `createApp`'s `features` option, which defaults to it) holds the names. Code checks `features.includes('<name>')` in as few places as possible: preferably one, where the feature's routes are mounted in `src/app.ts`. A switched-off feature then has no routes at all (404), and nothing else needs to know about it. Every flag gets a test that the feature is absent when it's off (`createApp(db, ..., {features: []})`, as in `__tests__/planner/reports.test.ts`).

Anything outside the app that calls the feature must cope with it being off. The **Refresh game data** workflow, for example, skips the planner's catalog when the backend answers 404.

### Adding a flag

1. Add the name to `FEATURES` in `src/config.ts`.
2. Mount the feature's routes only when `features.includes('<name>')`.
3. Add the name to staging's `FEATURES` in `wrangler.jsonc` and to `__tests__/utils/env.ts`, and add the off test.
4. In the frontend, add the same flag (its `trunk-based` skill).

### Releasing a feature

1. Add its name to production's `FEATURES` in `wrangler.jsonc`, in its own PR (`feat(<scope>): release <feature>`), and in the frontend's production environment.
2. Merge, then deploy production: the backend first, then the frontend.
3. Once it has run in production for a while, remove the flag in a follow-up PR: the name in `FEATURES`, the check, the off test and the `wrangler.jsonc` entries. Flags are temporary; don't let them pile up.

## What production runs: prod-* tags

Every **Deploy production** run tags the commit it deployed `prod-YYYY-MM-DD-HHMM` (UTC) and pushes the tag. The latest such tag is what production runs:

```
git fetch --tags
git tag --list 'prod-*' --sort=-creatordate | head -1
git log --oneline <tag>..origin/main        # what's on main but not yet in production
```

A deploy by hand (`npx wrangler deploy`) isn't tagged by the workflow; tag it yourself the same way (`git tag prod-… <sha> && git push origin prod-…`), and deploy with `--message "<branch>@<short sha>"` so `npx wrangler deployments list` shows it.

Saved release branches (`release/<date>`) aren't needed: a tag marks the same commit, and a branch can be started from it whenever one is needed.

## Hotfixing production

1. **Normally**, a hotfix is an ordinary branch: `hotfix/<description>` from `main`, a PR, merge, then deploy production from `main` (the `deploy` skill). Because `main` is always releasable, this ships only what's ready.
2. **Only if `main` holds something that must not reach production** (a change that should have been behind a flag): start the branch from the latest `prod-*` tag instead (`git switch -c hotfix/<description> <tag>`), run `npm test`, push it, deploy it by hand with `npx wrangler deploy --message "hotfix/<description>@<sha>"` (only when the user asks for it), and tag it as above. Then open a PR from the same branch to `main`, so the fix isn't lost on the next deploy. Afterwards, put the change that blocked `main` behind a flag.
