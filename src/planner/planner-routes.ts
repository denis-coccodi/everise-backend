import {Db} from '../db';
import {FflogsClient, FflogsFetch, FflogsSettings} from './fflogs-client';
import {PlannerRouter} from './planner-router';
import {ReportsService} from './reports-service';

// Everything the fight planner needs, put together for the app
// (src/app.ts). Kept to itself so it can move to its own project later.
interface PlannerParts {
  db: Db;
  // The site's FFLogs API client, and how the planner reaches FFLogs.
  settings: FflogsSettings;
  fetch: FflogsFetch;
  now: () => Date;
}

function plannerRoutes(parts: PlannerParts) {
  const client = new FflogsClient(parts.settings, parts.fetch, parts.now);
  const reports = new ReportsService(parts.db, client, parts.now);
  return new PlannerRouter(reports).router;
}

export {plannerRoutes};
