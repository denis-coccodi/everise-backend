import * as express from 'express';
import {route} from '../api';
import {SitemapResponse} from './sitemap-schemas';
import {SitemapService} from './sitemap-service';

// What the frontend's sitemap.xml (worker/index.ts) is built from: the
// posts' ids and dates, the data centres with a Party Finder page, and this
// week's venues and events. Open to everyone, like the pages themselves.
class SitemapRouter {
  constructor(private readonly sitemap: SitemapService) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/sitemap',
        summary:
          "The posts, Party Finder pages, venues and events for the site's sitemap",
        responses: {200: {description: 'The pages.', schema: SitemapResponse}},
      },
      async (_req, res) => {
        res
          .set('Cache-Control', 'public, max-age=3600')
          .json(await this.sitemap.pages());
      },
    );

    return router;
  }
}

export {SitemapRouter};
