import {CatalogRouter} from './catalog/catalog-router';
import {CatalogService} from './catalog/catalog-service';
import {CatalogGet} from './catalog/xivapi-actions';
import {Db} from '../db';
import {Auth} from '../middleware';
import {FflogsClient, FflogsFetch} from './fflogs-client';
import {GuestLookups} from './guest-lookups';
import {PlannerRouter} from './planner-router';
import {LocalPulls, PullSource} from './pull-source';
import {ReportsService} from './reports-service';
import {ClearsService} from './clears-service';
import {FflogsSettings} from './fflogs-model';
import {FightKinds} from './fight-report-model';

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
  // The game data: what kind of fight each game territory holds, and the
  // latest expansion.
  duties: {
    fightKinds(): Promise<FightKinds>;
    latestExpansion(): Promise<string | null>;
  };
  // How the action catalog reaches XIVAPI, and the game data refresh's
  // key, which rebuilds it.
  xivapi: CatalogGet;
  refreshKey?: string;
  now: () => Date;
}

function plannerRoutes(parts: PlannerParts) {
  const client = new FflogsClient(parts.settings, parts.fetch, parts.now);
  const reports = new ReportsService(
    parts.db,
    client,
    () => parts.duties.fightKinds(),
    () => parts.duties.latestExpansion(),
    parts.now,
  );
  const pulls = parts.pulls ?? new LocalPulls(client);
  const catalog = new CatalogService(parts.db, parts.xivapi, parts.now);
  return [
    new PlannerRouter(
      parts.auth,
      reports,
      pulls,
      new GuestLookups(parts.db, parts.now),
      new ClearsService(parts.db, client, reports, parts.now),
    ).router,
    new CatalogRouter(catalog, parts.refreshKey).router,
  ];
}

export {plannerRoutes};
