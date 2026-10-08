import * as express from 'express';
import {route} from '../api';
import {Db, Doc} from '../db';
import {DATA_CENTRE_NAMES} from '../party-finder';
import {SitemapResponse} from './sitemap-schemas';

// A sitemap holds at most 50,000 addresses; the site lists its newest posts.
const MAX_ARTICLES = 5000;

// What the frontend's sitemap.xml (worker/index.ts) is built from: the
// posts' ids and dates, and the data centres with a Party Finder page. Open
// to everyone, like the pages themselves.
class SitemapRouter {
  constructor(private readonly db: Db) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/sitemap',
        summary: "The posts and Party Finder pages for the site's sitemap",
        responses: {200: {description: 'The pages.', schema: SitemapResponse}},
      },
      async (_req, res) => {
        // The posts collection, as ArticlesService keeps it.
        const articles = await this.db.find<Doc>('articles', {
          orderBy: [{field: 'updatedAt', direction: 'desc'}],
          limit: MAX_ARTICLES,
        });
        res.set('Cache-Control', 'public, max-age=3600').json({
          articles: articles.map(article => ({
            id: article.id,
            updatedAt: article.updatedAt,
          })),
          dataCentres: DATA_CENTRE_NAMES,
        });
      },
    );

    return router;
  }
}

export {SitemapRouter};
