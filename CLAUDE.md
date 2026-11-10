# Working in this repo

- Every change goes through a branch named `bugfix/<description>` for a bug fix (`hotfix/` when production is broken) or `feature/<description>` for anything else, with Conventional Commits messages (`fix(events): …`) and a pull request to `main`; `main` rejects direct pushes and requires the `test` check. Follow the `feature-branch` skill before the first edit.
- Merging to `main` deploys staging automatically. Production is deployed by hand (`deploy` skill); never start it unless asked.
- Trunk-based development (`trunk-based` skill): `main` is always releasable, so unfinished features merge switched off in production behind a `FEATURES` flag; each production deploy is tagged `prod-YYYY-MM-DD-HHMM`.
- `npm test` runs the tests, type-check, lint, format check and size check; it must exit 0 before pushing.
- Follow the `backend-best-practices` skill when writing or changing code under `src/` or `__tests__/` (routers, services, `HttpError` errors, no `any`, file size limits).
- Documentation lives in `docs/`, built by GitHub Pages and served at everise.dev/docs/backend/ by the frontend's Worker; the plain-language site guide (everise.dev/guide/) is in the frontend's `docs/_guide`. Update the pages a change affects in the same pull request (and the guide when users would notice), and document only what exists. Follow the `docs-site` skill for anything under `docs/`.
