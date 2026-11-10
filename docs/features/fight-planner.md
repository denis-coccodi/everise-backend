---
title: Fight planner
parent: Features
nav_order: 9
---

# Fight planner

The fight planner schedules a party's heals and mitigations for one pull of an Extreme, Savage or Ultimate fight, from that party's FFLogs report.

- **Where the work happens:** the planning itself runs in the browser (the frontend's `libs/planner`). The backend (`src/planner`) reads FFLogs and keeps what it read.
- **Behind a flag:** it's behind the `planner` feature flag, on in staging and off in production, where its endpoints answer 404.
- **Separate module:** it's kept apart from the rest of the backend, so it can move to a project of its own later.

The repository's `fight-planner` skill has the full design.

## Reading FFLogs

- **Client:** FFLogs' v2 GraphQL API, as the site's own client (`FFLOGS_CLIENT_ID`, `FFLOGS_CLIENT_SECRET`, client credentials). So only public and unlisted reports can be read.
- **Token:** kept until an hour before it expires, and asked for again if FFLogs refuses it.
- **Without the client:** `GET /api/planner/available` says `false`, and the report endpoint answers 503.
- **PlannerHub:** pulls are read through the `PlannerHub` Durable Object. A pull is several MB of events, which needs more CPU than a Worker request may use, and the hub shares one FFLogs token.
- **Caching:** finished pulls are kept in the data centre's cache, so a pull looked at again costs no FFLogs points.

## Endpoints

| Endpoint | What |
|---|---|
| `GET /api/planner/available` | Whether FFLogs is set up |
| `GET /api/planner/reports/:code` | The report in the planner's own shape (`fight-report-model.ts`): title, times, the Extreme, Savage and Ultimate pulls in order, and the players and their jobs |
| `GET /api/planner/reports/:code/pulls/:pullId` | One pull as a timeline (`pull-timeline-model.ts`): players with max HP and stats, enemies, every hit taken, heals, statuses |
| `GET …/pulls/:pullId/clears` | Up to three other groups' kills of the same fight, from FFLogs' rankings. Kept in `fflogsClears` for a week |
| `GET …/pulls/:pullId/script` | The fight's mechanics in order, from [cactbot](https://github.com/OverlayPlugin/cactbot)'s timelines (`src/planner/scripts`). `null` for a fight cactbot has no timeline for yet |
| `GET /api/planner/catalog` | Every combat job's actions (about 670), with what about 150 heals and mitigations do (`src/planner/catalog`) |
| `POST /api/planner/catalog/refresh` | Rebuilds the action catalog (`X-Refresh-Key`) |

## Storage and limits

- **Reports** are kept in `fflogsReports` with every boss pull.
  - A report that ended an hour before it was read is never asked for again.
  - One still being logged is read again after 2 minutes.
- **FFLogs points:** each new read spends the site's FFLogs points, which are limited per hour.
- **Guests:** they may look up 10 new reports and 10 new pulls an hour each, and all guests together 40 (`plannerGuestLookups`), so members always keep most of the points.
- **Old expansions:** reports recorded before the game's latest expansion aren't planned, because the planner uses the latest patch's values.
