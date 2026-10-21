import {createHash, timingSafeEqual} from 'crypto';
import * as express from 'express';
import {route, sendJsonText} from '../../api';
import {UnauthorizedError} from '../../errors';
import {ActionCatalogResponse, CatalogRefreshResponse} from './catalog-schemas';
import {CatalogService} from './catalog-service';

const REFRESH_KEY_HEADER = 'x-refresh-key';

// The planner's action catalog: open to everyone (it's game data), and
// built again with the game data refresh (the same key as the duties').
class CatalogRouter {
  constructor(
    private readonly catalog: CatalogService,
    private readonly refreshKey: string | undefined,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/planner/catalog',
        summary: "The jobs' actions, with their heals and mitigations",
        responses: {
          200: {description: 'The catalog.', schema: ActionCatalogResponse},
        },
      },
      async (_req, res) => {
        // The same for everyone; it changes with patches.
        res.set('Cache-Control', 'public, max-age=3600');
        sendJsonText(res, await this.catalog.json());
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/planner/catalog/refresh',
        summary: 'Build the action catalog again (needs x-refresh-key)',
        responses: {
          200: {description: 'What was built.', schema: CatalogRefreshResponse},
        },
      },
      async (req, res) => {
        if (!this.isRefreshKey(req.header(REFRESH_KEY_HEADER))) {
          throw new UnauthorizedError('invalid refresh key');
        }
        res.json(await this.catalog.refresh());
      },
    );

    return router;
  }

  // Without a configured key, refreshing is disabled.
  private isRefreshKey(key: string | undefined) {
    if (!this.refreshKey || !key) return false;
    // Hashing gives equal lengths, which timingSafeEqual requires.
    const hash = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(hash(key), hash(this.refreshKey));
  }
}

export {CatalogRouter};
