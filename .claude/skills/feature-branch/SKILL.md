---
name: feature-branch
description: The required way to make any change in this repo (code, tests, docs, config, skills) - work on a feature/<name> branch, push it freely, open a pull request to main, and merge only once the required test check passes. Use before the first edit of every change, and whenever asked to commit, push, open a PR, merge, or ship something to staging.
---

# Feature branch → pull request → main

`main` is protected: nobody, admins included, can push to it directly. Every change reaches `main` through a pull request, and the PR can only be merged once the `test` check (the CI/CD workflow's test job) passes. Merging into `main` then deploys to staging automatically. Production stays a separate manual step (see the `deploy` skill).

## 1. Start a branch before the first edit

```
git switch main
git pull --ff-only
git switch -c feature/<feature-name>
```

- `<feature-name>` is short kebab-case describing the change: `feature/staging-environment`, `feature/fix-flaky-tags-test`, `feature/readme-endpoints`. Use the `feature/` prefix for every change, fixes and docs included.
- One branch per change. If already on a feature branch for the same change, keep using it. If the working tree has unrelated uncommitted changes, ask the user before carrying them onto the new branch.
- Never commit on `main`. If you notice commits made on `main` by mistake, move them: `git switch -c feature/<name>` then reset local `main` to `origin/main` (check with the user before resetting).

## 2. Commit and push as often as needed

```
npm test                              # tests + type-check + lint; must exit 0
git add <files> && git commit -m "..."
git push -u origin feature/<feature-name>   # later pushes: git push
```

Pushing to a feature branch deploys nothing. End commit messages with the attribution line from the current session's instructions.

## 3. Open a pull request to main

After the first push:

```
gh pr create --base main --head feature/<feature-name> --title "<what changed>" --body "<why, what, how it was tested>"
```

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
gh pr merge <number> --squash --delete-branch
git switch main && git pull --ff-only
```

Squash keeps one commit per change on `main`. After merging, follow the CI/CD push run on `main` (test → deploy-staging → smoke test) as in the `deploy` skill, and report the staging result.

## Notes

- To try a branch on staging before merging, start CI/CD by hand on that branch (`gh workflow run ci-cd.yaml --ref feature/<name>`). It replaces what staging runs until the next merge to `main`; tell the user.
- Do not change branch protection or rulesets to get a PR merged. If something blocks the merge that is not a failing check, tell the user.
