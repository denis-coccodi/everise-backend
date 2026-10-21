import {Db} from '../db';
import {Auth} from '../middleware';
import {FflogsClient, FflogsFetch, FflogsSettings} from './fflogs-client';
import {FightKinds} from './fight-report';
import {PlannerRouter} from './planner-router';
import {ReportsService} from './reports-service';

// Everything the fight planner needs, put together for the app
// (src/app.ts). Kept to itself so it can move to its own project later.
interface PlannerParts {
  auth: Auth;
  db: Db;
  // The site's FFLogs API client, and how the planner reaches FFLogs.
  settings: FflogsSettings;
  fetch: FflogsFetch;
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
  return new PlannerRouter(parts.auth, reports).router;
}

export {plannerRoutes};
