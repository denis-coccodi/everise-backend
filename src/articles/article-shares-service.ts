import {Db, Doc} from '../db';
import {
  ForbiddenError,
  TooManyRequestsError,
  UnavailableError,
  UpstreamError,
} from '../errors';
import {ProfilesService} from '../profiles';
import {User} from '../users';
import {ArticleAnnouncer} from './announce-article';
import {ArticleDto} from './article-dto';
import {ArticlesService} from './articles-service';

// How often each member may share a post in the Everise Discord.
const SHARE_INTERVAL_SECONDS = 60;

interface ShareLimitDoc extends Doc {
  until?: number;
}

// Shares a post in the Everise Discord after it was posted: its author may
// share their own post, and an admin any post (Tataru's guests' results
// too). The post goes as it would have on creation, as anyone who isn't
// signed in sees it.
class ArticleSharesService {
  private readonly limitsCollection = 'postLimits';

  constructor(
    private readonly db: Db,
    private readonly articlesService: ArticlesService,
    private readonly profilesService: ProfilesService,
    private readonly discord: ArticleAnnouncer,
    private readonly now: () => Date,
  ) {}

  async toDiscord(user: User, key: string) {
    if (!this.discord.available) {
      throw new UnavailableError(
        "Sharing to the Everise Discord isn't set up on this site.",
      );
    }
    const article = await this.articlesService.requireArticle(key);
    if (article.authorId !== user.id && user.role !== 'admin') {
      throw new ForbiddenError(
        'Only its author or an admin can share a post in the Everise Discord.',
      );
    }
    await this.takeTurn(`post-discord-${user.id}`);
    const author = await this.profilesService.getProfile(article.authorId);
    const sent = await this.discord.announceArticle(
      new ArticleDto(article, false, author).article,
    );
    if (!sent) {
      throw new UpstreamError(
        "Discord didn't take the message. Try again in a minute.",
      );
    }
  }

  // One share a minute per member, taken in one step so two clicks at once
  // make one share.
  private async takeTurn(key: string) {
    const now = this.now().getTime();
    const taken = await this.db.takeLease(
      this.limitsCollection,
      key,
      'until',
      now,
      now + SHARE_INTERVAL_SECONDS * 1000,
    );
    if (taken) return;
    const doc = await this.db.get<ShareLimitDoc>(this.limitsCollection, key);
    const wait = Math.max(1, Math.ceil(((doc?.until ?? now) - now) / 1000));
    throw new TooManyRequestsError(
      `You can share another post in ${wait} seconds.`,
      wait,
    );
  }
}

export {ArticleSharesService, SHARE_INTERVAL_SECONDS};
