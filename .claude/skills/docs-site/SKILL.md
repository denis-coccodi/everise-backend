---
name: docs-site
description: How Everise's documentation works - the backend's technical pages in docs/, built by GitHub Pages and served at everise.dev/docs/backend/ by the frontend's Worker, in the site's own look, next to the site guide (/guide/) and the frontend docs (/docs/frontend/). Use before writing or changing anything under docs/, when a change alters something the docs describe (an endpoint, setting, collection, feature or operation), or when asked where documentation goes.
---

# The documentation

All of Everise's documentation is in the two repositories' `docs/` folders, and nowhere else: not Confluence, not the GitHub wiki. The user chose this on 2026-11-10, so the docs change in the same pull requests as the code.

| Address on everise.dev | What | Built from |
|---|---|---|
| `/docs/backend/` | **Backend technical docs**: architecture, API, data model, authentication, configuration, operations, a page per feature | this repository's `docs/` |
| `/docs/frontend/` | Frontend technical docs | everise-frontend's `docs/` |
| `/guide/` | **Site guide**: what the site offers and how to use it, in plain language | everise-frontend's `docs/_guide/` |

The frontend repository's `docs-site` skill is the full reference: the Worker that serves the docs, the look, the guide's building blocks, and screenshots.

## Rules

1. **Only what exists.** Describe the backend as it is. Check claims against the code (`src/`, `wrangler.jsonc`), not only the README, which has been wrong before:
   - the planner's auth (guests may look up reports);
   - a Waking Sands spoiler rule that the prompts don't have;
   - a missing Durable Object (`PlannerHub`) and collections (`siteStorage`, `plannerGuestLookups`).
   No placeholder pages.
2. **Update with the change.** A pull request that changes an endpoint, a setting, a collection, a feature or how something is deployed updates the matching page in the same PR:
   - `docs/api.md` for endpoints;
   - `docs/configuration.md` for settings;
   - `docs/data-model.md` for collections;
   - `docs/features/*.md` for features;
   - `docs/operations.md` for deploys and setup.
   If players, testers or admins would notice the change, the site guide in the frontend repository needs a PR too.
3. **Technical pages may name anything** a developer needs. The plain-language guide never names code.

## How it's built

- **GitHub Pages** builds `docs/` on every push to `main` (source: `main`, `/docs`). It's plain Jekyll with `jekyll-relative-links`.
- **Base URL:** `/docs/backend`, so links point at the everise.dev address. The frontend's Worker serves `/docs/backend/x` from `denis-coccodi.github.io/everise-backend/x`.
- **Layouts:** `_layouts/docs.html`, `_includes/head.html` and `_includes/topbar.html` are **copies of the frontend's**: change both repositories together.
  - The stylesheet is the frontend's (`/docs/frontend/everise-docs.css`).
  - The crest is the site's own (`/assets/images/everise-crest.png`).
  - Pages only look right at everise.dev; github.io redirects there.
- **Contents column:** built from front matter: `title`, `nav_order`, and `parent`/`has_children` for the Features pages.
- **Formatting:**
  - Markdown is excluded from Prettier (`.prettierignore`), so keep tables and lists tidy by hand, with a blank line before every list.
  - `docs/_layouts` and `docs/_includes` are excluded too, because Prettier breaks Liquid tags.
- **Checking a change:** after the merge, wait for the Pages build (`gh api repos/denis-coccodi/everise-backend/pages/builds/latest`), then open the changed pages at everise.dev/docs/backend/.

## The wiki

The repository's GitHub wiki is a **read-only copy** of these technical pages (not the site guide):
- **How it's written:** `.github/workflows/wiki.yaml` runs `scripts/wiki-sync.mjs` on every merge to `main` that touches `docs/`, and pushes to `<repo>.wiki.git`.
- **Conversion:** the script strips front matter and `{: .…}` markers, turns links between pages into wiki page names (from each page's `title`) and links to the other repository or the guide into everise.dev addresses, points pictures at `raw.githubusercontent.com/.../main/docs/`, and writes `Home`, `_Sidebar` and `_Footer`.
- **Never edit the wiki:** the next sync overwrites it. Change `docs/`.
- **Both repositories:** the script is the same in both; change both together.
- **First time:** the wiki's git repository only exists after its first page is saved in the web interface (Wiki → Create the first page).
