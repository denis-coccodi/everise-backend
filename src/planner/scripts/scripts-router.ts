import * as express from 'express';
import {route} from '../../api';
import {UnauthorizedError, UnavailableError} from '../../errors';
import {REFRESH_KEY_HEADER, isRefreshKey} from '../refresh-key';
import {ScriptsCheckResponse, ScriptsSyncResponse} from './scripts-schemas';
import {ScriptsService} from './scripts-service';
import {ScriptsSync} from './scripts-sync';

// The fights' scripts, for the game data refresh (with the duties' key):
// a run of the cactbot sync now (it also runs on the cron trigger), and a
// check of which fights have none yet.
class ScriptsRouter {
  constructor(
    private readonly scripts: ScriptsService,
    private readonly sync: ScriptsSync | undefined,
    private readonly refreshKey: string | undefined,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'post',
        path: '/planner/scripts/sync',
        summary:
          "Read cactbot's latest timelines now, a few files a call (needs x-refresh-key)",
        responses: {
          200: {
            description: 'Where the copy stands.',
            schema: ScriptsSyncResponse,
          },
        },
      },
      async (req, res) => {
        this.checkKey(req);
        if (!this.sync) {
          throw new UnavailableError(
            "The fight scripts can't reach GitHub here.",
          );
        }
        const run = await this.sync.sync(true);
        res.json(
          run
            ? {busy: false, ...run}
            : {busy: true, commit: null, pending: 0, kept: []},
        );
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/planner/scripts/check',
        summary: 'Which fights have no script yet (needs x-refresh-key)',
        responses: {
          200: {description: 'The scripts kept.', schema: ScriptsCheckResponse},
        },
      },
      async (req, res) => {
        this.checkKey(req);
        res.json(await this.scripts.check());
      },
    );

    return router;
  }

  private checkKey(req: express.Request) {
    if (!isRefreshKey(req.header(REFRESH_KEY_HEADER), this.refreshKey)) {
      throw new UnauthorizedError('invalid refresh key');
    }
  }
}

export {ScriptsRouter};
