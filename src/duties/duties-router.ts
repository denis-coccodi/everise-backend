import {createHash, timingSafeEqual} from 'crypto';
import * as express from 'express';
import {UnauthorizedError} from '../errors';
import {DutiesService} from './duties-service';

// Header carrying the key that allows a refresh (the DUTIES_REFRESH_KEY secret).
const REFRESH_KEY_HEADER = 'x-refresh-key';

class DutiesRouter {
  constructor(
    private readonly dutiesService: DutiesService,
    private readonly refreshKey: string | undefined
  ) {}

  get router() {
    const router = express.Router();

    router.get('/duties', async (_req, res, next) => {
      try {
        return res.json(await this.dutiesService.getDutyGroups());
      } catch (err) {
        return next(err);
      }
    });

    router.get('/frontline', async (_req, res, next) => {
      try {
        return res.json(await this.dutiesService.getFrontline());
      } catch (err) {
        return next(err);
      }
    });

    router.get('/roulettes', async (_req, res, next) => {
      try {
        return res.json(await this.dutiesService.getRoulettes());
      } catch (err) {
        return next(err);
      }
    });

    // Re-downloads both lists from XIVAPI and replaces the cached copies.
    router.post('/duties/refresh', async (req, res, next) => {
      try {
        if (!this.isRefreshKey(req.header(REFRESH_KEY_HEADER))) {
          throw new UnauthorizedError('invalid refresh key');
        }

        return res.json(await this.dutiesService.refresh());
      } catch (err) {
        return next(err);
      }
    });

    return router;
  }

  // Without a configured key, refreshing is disabled.
  private isRefreshKey(key: string | undefined) {
    if (!this.refreshKey || !key) {
      return false;
    }

    // Hashing gives equal lengths, which timingSafeEqual requires.
    const hash = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(hash(key), hash(this.refreshKey));
  }
}

export {DutiesRouter};
