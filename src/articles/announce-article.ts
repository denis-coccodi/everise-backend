import {LiveFeed} from '../live/live-feed';
import {ProfilesService} from '../profiles';
import {ArticleDoc, toArticle} from './article-docs';
import {ArticleDto} from './article-dto';

// Where a post goes when its author asks: the Everise Discord
// (DiscordAnnouncer).
interface ArticleAnnouncer {
  announceArticle(article: ArticleDto['article']): Promise<void>;
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
