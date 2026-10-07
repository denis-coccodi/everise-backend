# Working in this repo

- Every change goes through a `feature/<name>` branch and a pull request to `main`; `main` rejects direct pushes and requires the `test` check. Follow the `feature-branch` skill before the first edit.
- Merging to `main` deploys staging automatically. Production is deployed by hand (`deploy` skill); never start it unless asked.
- `npm test` runs the tests, type-check, lint, format check and size check; it must exit 0 before pushing.
- Follow the `backend-best-practices` skill when writing or changing code under `src/` or `__tests__/` (routers, services, `HttpError` errors, no `any`, file size limits).
