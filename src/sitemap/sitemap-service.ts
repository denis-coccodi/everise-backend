import {Db, Doc} from '../db';
import {DATA_CENTRE_NAMES} from '../party-finder';

// A sitemap holds at most 50,000 addresses; the site lists its newest posts.
const MAX_ARTICLES = 5000;

// What the frontend's sitemap.xml is built from: the newest posts' ids and
// dates, the data centres with a Party Finder page, and the venues and
// events the site shows this week (empty while their source can't be
// reached).
class SitemapService {
  constructor(
    private readonly db: Db,
    private readonly venues: () => Promise<string[]> = async () => [],
    private readonly events: () => Promise<number[]> = async () => [],
  ) {}

  async pages() {
    // The posts collection, as ArticlesService keeps it.
    const articles = await this.db.find<Doc>('articles', {
      orderBy: [{field: 'updatedAt', direction: 'desc'}],
      limit: MAX_ARTICLES,
    });
    return {
      articles: articles.map(article => ({
        id: article.id,
        updatedAt: article.updatedAt,
      })),
      dataCentres: DATA_CENTRE_NAMES,
      venues: await this.venues(),
      events: await this.events(),
    };
  }
}

export {SitemapService};
