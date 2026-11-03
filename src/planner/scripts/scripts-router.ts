import * as express from 'express';
import {route} from '../../api';
import {UnauthorizedError} from '../../errors';
import {REFRESH_KEY_HEADER, isRefreshKey} from '../refresh-key';
import {
  NewScript,
  ScriptStoredResponse,
  ScriptsCheckResponse,
} from './scripts-schemas';
import {ScriptsService} from './scripts-service';

// The fights' scripts, sent by the game data refresh (with the duties'
// key): one cactbot timeline file a request, then a check of which fights
// have none yet.
class ScriptsRouter {
  constructor(
    private readonly scripts: ScriptsService,
    private readonly refreshKey: string | undefined,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'post',
        path: '/planner/scripts',
        summary:
          "Keep a fight's script, from a cactbot timeline (needs x-refresh-key)",
        body: NewScript,
        responses: {
          200: {description: 'What was kept.', schema: ScriptStoredResponse},
        },
      },
      async (req, res) => {
        this.checkKey(req);
        const {commit, path, zone, text} = req.body;
        res.json(await this.scripts.store({commit, path}, zone, text));
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
