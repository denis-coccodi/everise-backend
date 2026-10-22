---
name: feature-branch
description: The required way to make any change in this repo (code, tests, docs, config, skills) - work on a bugfix/, hotfix/ or feature/<description> branch, Conventional Commits messages and PR titles, push it freely, open a pull request to main, and merge only once the required test check passes. Use before the first edit of every change, and whenever asked to name a branch, commit, write a commit message, push, open a PR, merge, or ship something to staging.
---

# Feature branch → pull request → main

`main` is protected: nobody, admins included, can push to it directly. Every change reaches `main` through a pull request, and the PR can only be merged once the `test` check (the Test and deploy staging workflow's test job) passes. Merging into `main` then deploys to staging automatically. Production stays a separate manual step (see the `deploy` skill).

The repo follows trunk-based development (the `trunk-based` skill): branches live a day or two, and `main` must always be fine to deploy to production. A feature that takes several PRs merges each one switched off in production behind a feature flag.

## 1. Start a branch before the first edit

```
git switch main
git pull --ff-only
git switch -c <branch>      # bugfix/…, hotfix/… or feature/…
```

- Name the branch `<type>/<description>`, the type saying what kind of change it is:
  - `bugfix/`: a bug fix, something that doesn't work as it should (`bugfix/event-banner-extension`, `bugfix/flaky-tags-test`). Never `feature/` for a fix.
  - `hotfix/`: an urgent fix for something broken in production, deployed to production right after it merges (the `deploy` skill). Only when `main` holds something that can't go to production, it starts from the latest `prod-*` tag instead (the `trunk-based` skill).
  - `feature/`: everything else: a new feature, a change in behaviour, docs, config, skills, refactoring (`feature/venue-events`, `feature/readme-endpoints`).
- The description is 2 to 5 words saying what the branch does, lowercase, words joined by hyphens: letters, digits and hyphens only, no trailing hyphen, no dates or names. Below, `<branch>` stands for the whole name.
- One branch per change. If already on a branch for the same change, keep using it. If the working tree has unrelated uncommitted changes, ask the user before carrying them onto the new branch.
- Unfinished work that merges must be switched off in production: behind a flag in `FEATURES` (the `trunk-based` skill). Never leave a half-built feature reachable on `main`.
- Never commit on `main`. If you notice commits made on `main` by mistake, move them: `git switch -c <branch>` then reset local `main` to `origin/main` (check with the user before resetting).

## 2. Commit and push as often as needed

```
npm test                              # tests + type-check + lint; must exit 0
git add <files> && git commit -m "..."
git push -u origin <branch>   # later pushes: git push
```

Pushing to a branch other than `main` deploys nothing. End commit messages with the attribution line from the current session's instructions.

### Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) and [the seven rules of a good commit message](https://cbea.ms/git-commit/):

```
fix(events): add .webp to banner names without an extension

Partake's CDN answers a bare attachment name with a 500 but serves it
with .webp added, so 13 of 139 events showed no banner. assetUrl now
adds the extension; names that have one are unchanged.

Co-Authored-By: …
```

- **Subject:** `<type>(<scope>): <description>`.
  - The type matches the branch: `fix` on a `bugfix/` or `hotfix/` branch; on a `feature/` branch `feat` (something new for users), `refactor`, `perf`, `test`, `docs`, `build`, `ci` or `chore`.
  - The scope is the area touched, one word, like the `src/` or `libs/` folder (events, venues, party-finder, db, worker, ci, skills). Leave it out when the change has no single area.
  - The description is in the imperative, as if completing "If applied, this commit will …": `add`, `fix`, `show`, not `added` or `adds`. Lowercase after the colon, no full stop.
  - Keep the whole subject to 50 characters where you can, 72 at most. The squash merge adds " (#123)".
  - A breaking API change (a removed or renamed field or endpoint) gets `!` before the colon (`feat(api)!: …`) and a `BREAKING CHANGE: …` footer.
- **Body:** after a blank line, wrapped at 72 columns. Say what was wrong or missing and why this is the fix; the diff shows how. A small, obvious change needs no body.
- **Footers:** after another blank line: `Refs: #123` when there is an issue, then the attribution line from the current session's instructions.
- One logical change per commit; a follow-up fix on the same branch is its own commit (`fix(events): …`), never a "wip" or "fix stuff".
- For a multi-line message, write it with a heredoc (`git commit -F - <<'EOF'`), not several `-m`.

## 3. Open a pull request to main

After the first push:

```
gh pr create --base main --head <branch> --title "<type>(<scope>): <description>" --body "<why, what, how it was tested>"
```

- The title is the commit subject the squash merge puts on `main`, so it follows the subject rules above. For a branch with several commits, it sums them up.
- The body says what changed and why, how it was verified, and anything the reviewer should check on staging after merge. End it with the PR attribution line from the session's instructions.
- Every later push to the branch updates the PR and re-runs `test`.

## 4. Wait for the required check

```
gh pr checks <number> --watch          # waits until checks finish
gh pr view <number> --json mergeStateStatus,statusCheckRollup
```

- If `test` fails, read the log (`gh run view <run-id> --log-failed`), fix on the same branch, push again. See the `deploy` skill's "Known failure causes".
- `main` requires branches to be up to date before merging. If the PR is behind (`mergeStateStatus: BEHIND`), run `gh pr update-branch <number>` and wait for `test` again.

## 5. Merge

Merge only when `test` has passed and the user has said to merge this change (an earlier "ship it", "merge it", or "deploy to staging" for this change counts). Otherwise, report the PR link and that it is ready to merge.

```
gh pr merge <number> --squash --delete-branch --subject "$(gh pr view <number> --json title -q .title) (#<number>)"
git switch main && git pull --ff-only
```

Squash keeps one commit per change on `main`, its subject the PR title. After merging, follow the Test and deploy staging push run on `main` (test → deploy-staging → smoke test) as in the `deploy` skill, and report the staging result.

## Notes

- To try a branch on staging before merging, start Test and deploy staging by hand on that branch (`gh workflow run ci-cd.yaml --ref <branch>`). It replaces what staging runs until the next merge to `main`; tell the user.
- Do not change branch protection or rulesets to get a PR merged. If something blocks the merge that is not a failing check, tell the user.
