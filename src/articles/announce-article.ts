import {LiveFeed} from '../live';
import {ProfilesService} from '../profiles';
import {toArticle} from './article-docs';
import {ArticleDto} from './article-dto';
import {ArticleDoc} from './article-model';

// Where a post goes when its author asks: the Everise Discord
// (DiscordAnnouncer). `available` when it's set up on this site;
// announceArticle answers whether the post went through.
interface ArticleAnnouncer {
  readonly available: boolean;
  announceArticle(article: ArticleDto['article']): Promise<boolean>;
}

// Pushes a new post to everyone on the site (GET /api/live), as anyone who
// isn't signed in sees it, and to Discord when `toDiscord`. Neither failing
// ever fails the post.
async function announceArticle(
  liveFeed: LiveFeed,
  profilesService: ProfilesService,
  doc: ArticleDoc,
  discord?: ArticleAnnouncer,
) {
  try {
    const author = await profilesService.getProfile(doc.authorId);
    const article = new ArticleDto(toArticle(doc), false, author).article;
    await Promise.all([
      liveFeed.publish({type: 'article-created', article}),
      discord?.announceArticle(article),
    ]);
  } catch (err) {
    console.error('announcing a post failed', err);
  }
}

export {ArticleAnnouncer, announceArticle};
