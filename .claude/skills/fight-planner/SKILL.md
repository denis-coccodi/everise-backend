---
name: fight-planner
description: How the fight planner's backend works (src/planner) - reading FFLogs reports through the v2 API as the site's client, the planner's own fight model, how pulls are sorted into Extreme, Savage and Ultimate from the game data, what is kept in fflogsReports - what the planner is meant to do, and what is built so far. Use when working on src/planner, the /planner endpoints, the FFLOGS_* settings, or when a report won't load in the planner.
---

# Fight planner

From one FFLogs report, the planner schedules the heals and mitigations of a party for a chosen pull of an Extreme, Savage or Ultimate fight, so that every unavoidable hit is survived with a margin. The planning runs in the browser; the backend only supplies the data (FFLogs reports, later the action catalog). It lives in `src/planner` and talks to nothing else in the app but `Db`, so it can move to its own project.

## What it is meant to do

Settled with the user (don't re-ask):

- Plan for **the group in the log**: their jobs, HP, stats and damage taken. Other groups' clears only fill in what a wiped pull didn't reach, scaled by this group's own damage rates.
- The user picks a pull, then sets the minimum HP margin (default 10% of max HP), the mode (as played / optimal with the same party), DPS vs damage taken (default: DPS, fewest GCD heals), and one member vs the whole party.
- Goals in order: every unavoidable hit survived with the margin; don't spend a cooldown early if a later hit would be left uncovered; the user's DPS/damage choice; spare resources add margin.
- v1 is heals and mitigations only, fitted into each player's rotation as played (GCD vs oGCD weave slots, cast times, charges, shared gauges, burst windows from raid-buff casts).
- Output: a tab per player with their heals and mitigations interleaved with the boss's hits, and a timeline of everyone's actions at the bottom.
- No positioning: everyone is in every AoE and in range.

## Reports (built)

- `FflogsClient` (`fflogs-client.ts`) asks FFLogs' GraphQL API (`www.fflogs.com/api/v2/client`) with a client-credentials token from `www.fflogs.com/oauth/token`, kept until an hour before it expires and asked for again on a 401. A missing report is a `NotFoundError`, a private one a `ForbiddenError` (their GraphQL error messages say "does not exist" / "permission"), a 429 or any other failure an `UpstreamError`. Without `FFLOGS_CLIENT_ID` and `FFLOGS_CLIENT_SECRET`, `available` is false and every query throws an `UnavailableError` (503).
- Private reports would need FFLogs' user sign-in (authorization code flow); not built, still undecided.
- `GET /api/planner/reports/:code` reads the report's fights and players (`REPORT_QUERY` in `fflogs-reports.ts`), keeps every boss pull (`LoggedReport`), and answers a `FightReport` (`fight-report.ts`, `coveredReport`) with only the pulls the planner covers. Members only (`auth.required`): each new report spends the site's FFLogs points; `GET /api/planner/available` stays open so the site can show the planner.
- **Never let FFLogs' shapes leave `fflogs-reports.ts`.** Everything else reads the planner's own model (`FightReport`, `ReportPull`, `ReportPlayer`), so another source (local ACT logs, deferred) can fill it later.
- Which pulls count: **never from names** (FFLogs zone names don't always say Extreme or Ultimate, e.g. "The Minstrel's Ballad: …"). Each FFLogs fight has `gameZone.id`, the game's TerritoryType id. The duty refresh reads each duty's `TerritoryType` and keeps the Extreme trials and the Savage and Ultimate raids by territory (`fightTerritories` in `src/duties/fight-territories.ts`, from the same `groupOf` the Duties page uses; one `dutyFights` document; `DutiesService.fightKinds()`), and the planner looks pulls up there (`pullKind`). A territory the game data doesn't know (a fight newer than the last refresh, or before the first refresh that read territories) counts only if FFLogs says difficulty 101 (Savage). Unreal and normal fights are left out. Trash (encounter 0) is dropped; other fights are only counted (`otherPulls`).
- After a new Extreme, Savage or Ultimate releases, run the duty refresh (the `refresh-game-data.yaml` GitHub Action) so its pulls show; kept reports pick it up without reading FFLogs again, since they keep every boss pull with its territory.
- FFLogs lists the Limit Break (`subType` `LimitBreak`) and stand-ins without a server (the environment, unattributed damage; `subType` `Unknown`) among the players and in `friendlyPlayers`: `isPlayer` drops them, so a pull has its real party (8 in every report checked).
- Jobs come from the actor's `subType` (`JOBS`: FFLogs' names, e.g. `WhiteMage`, to the abbreviation and role). A new job needs a line there; until then its players have a null job.
- Kept: `fflogsReports` (one per code, every boss pull, with `fetchedAt` and `version`). Raise `READ_VERSION` (`reports-service.ts`) whenever what is read or kept changes: reports kept by another version are read again; see the `db-structure` skill's collections. A report that ended an hour before it was read is never read again; one still being logged is read again after 2 minutes. Requests for a report being read wait for that read.

## Pull timelines (built)

- `GET /api/planner/reports/:code/pulls/:pullId` (members only) answers one covered pull as a `PullTimeline` (`pull-timeline.ts`, schema in `pull-schemas.ts`): the players with max HP (from `targetResources`) and stats (`combatantinfo`), the enemies (the environment is -1), damage taken, heals, shield absorbs, player and boss casts (from the cast bar's start, with `castMs`), status spans on players and enemies, deaths, and the names of every action and status. Times are ms from the pull's start. FFLogs numbers statuses as 1,000,000 + the game's status id; the timeline uses the game's ids.
- `ReportsService.pull` checks the pull is a covered one (404 otherwise) and gives its players; `readPull` (`fflogs-pull-query.ts`) reads every kind of event, first pages in one aliased query; `toTimeline` (`fflogs-pull.ts`) and `statusSpans` (`fflogs-statuses.ts`) convert it. FFLogs' shapes stay in those three files.
- **Paging:** later pages must pass the pull's `endTime` as well as `startTime` (`nextPageTimestamp`): with only a start, FFLogs sends nothing. Its pages never split a timestamp (they run a little over the limit), so there are no duplicates. 10,000 events a page: a Savage pull fits in one; an 18-minute Futures Rewritten kill has 10,630 heals (two pages).
- Rules checked on real kills (M9S, FRU, October 2026):
  - Damage is what the party **took**, whatever its source: the boss, adds, FFLogs' "Multiple Enemies", the environment (puddles, falls). Never filter damage by source.
  - HoT ticks: FFLogs numbers a HoT's own ticks by its status (heal `action: null`, `status` set) and credits them to the healer: most of them (1,732 in an M9S kill). When several HoTs tick on a player at once the game sends one sum, which FFLogs merges as "Combined HoTs" (action 500001) on its "Multiple Players" actor (631 ticks, 11.8M HP with overheal, in that kill). `creditMergedHots` (`fflogs-hots.ts`) credits each to the healers whose HoTs were on the player (status spans; a HoT is a status that ticks on its own somewhere in the pull): one HoT on the player, all its healer's (326 of 631); several, split by the median of each one's own ticks in the pull, by that healer (evenly if it never ticked alone), marked `estimated`. A merged tick with no known HoT on the player stays `source: null` (none in that kill). The merged entries keep action 500001.
  - Pets heal and cast for their owner (`pet` names the pet). Hits, heals and statuses on pets are left out.
  - The real Limit Break is credited to no player. A healer LB3 raises a party that's mostly dead: as played, read it as deaths and raises; in the optimal mode nobody dies, so it's never planned. Tank LBs are mitigation groups plan for set hits (with the LB gauge, later).
- **Free plan CPU:** a pull is 0.9 MB (M9S) to 2.5 MB (FRU) of timeline, more FFLogs JSON than a Worker request may parse (10 ms CPU). It's read in the `PlannerHub` Durable Object (`planner-hub.ts`, binding `PLANNER`, one instance named `fflogs` so the token is shared; 30 s CPU) and comes back as JSON text that the Worker sends as is (`sendJsonText` in `src/api/route.ts`; in tests it goes through `res.json`, so the schema is checked). Tests read pulls in the app (`LocalPulls`).
- **Kept** in the data centre's cache (Cache API, free, evicts what isn't used), never in R2 (its free 10 GB are shared with uploads): finished reports' pulls for 30 days, keyed by `TIMELINE_VERSION` (raise it when the timeline's shape changes). A repeat look takes ~0.35 s instead of ~2.5 s and spends no FFLogs points. A first read costs about 10 points (the client has 1,000 an hour).

## Next steps

1. The action catalog: each job's actions (recast, cast time, charges, duration, potency) added to the XIVAPI refresh (`src/duties`, `POST /api/duties/refresh`), plus mitigation percentages and shield sizes, which XIVAPI doesn't have (tooltips, Lodestone job guides, patch notes).
2. The planner in the browser (frontend): reading the timeline, the options form, the scheduler, one tab per player and the timeline graph.
3. Boss timelines for the unseen part of wiped pulls, from cleared reports in FFLogs' rankings.

## Checking against FFLogs

Tests use `FakeFflogs` (`__tests__/utils/fake-fflogs.ts`), which answers as FFLogs does. To see what FFLogs really sends, put `FFLOGS_CLIENT_ID` and `FFLOGS_CLIENT_SECRET` in `.dev.vars` (never commit them), run `npm start` (it listens on port 8080), sign in, and load a public report: `curl localhost:8080/api/planner/reports/<code> -H "authorization: Token <token>"`, then a pull with `/pulls/<id>`. Locally, run the duty refresh once first (any `DUTIES_REFRESH_KEY` in `.dev.vars`, sent as `X-Refresh-Key`), or only Savage pulls are recognised. Each query spends the client's hourly FFLogs points (`rateLimitData { pointsSpentThisHour limitPerHour }`).
