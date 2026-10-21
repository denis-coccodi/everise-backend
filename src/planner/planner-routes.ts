import {Db} from '../db';
import {Auth} from '../middleware';
import {FflogsClient, FflogsFetch, FflogsSettings} from './fflogs-client';
import {FightKinds} from './fight-report';
import {PlannerRouter} from './planner-router';
import {LocalPulls, PullSource} from './pull-source';
import {ReportsService} from './reports-service';

// Everything the fight planner needs, put together for the app
// (src/app.ts). Kept to itself so it can move to its own project later.
interface PlannerParts {
  auth: Auth;
  db: Db;
  // The site's FFLogs API client, and how the planner reaches FFLogs.
  settings: FflogsSettings;
  fetch: FflogsFetch;
  // Where pulls' timelines are read: in the Worker, the PlannerHub
  // Durable Object; otherwise in this process.
  pulls?: PullSource;
  // The game data: what kind of fight each game territory holds.
  duties: {fightKinds(): Promise<FightKinds>};
  now: () => Date;
}

function plannerRoutes(parts: PlannerParts) {
  const client = new FflogsClient(parts.settings, parts.fetch, parts.now);
  const reports = new ReportsService(
    parts.db,
    client,
    () => parts.duties.fightKinds(),
    parts.now,
  );
  const pulls = parts.pulls ?? new LocalPulls(client);
  return new PlannerRouter(parts.auth, reports, pulls).router;
}

export {plannerRoutes};
