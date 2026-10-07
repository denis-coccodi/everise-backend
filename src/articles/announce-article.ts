import {LiveFeed} from '../live/live-feed';
import {ProfilesService} from '../profiles';
import {ArticleDoc, toArticle} from './article-docs';
import {ArticleDto} from './article-dto';

// Pushes a new post to everyone on the site (GET /api/live), as anyone who
// isn't signed in sees it. A live update that fails never fails the post.
async function announceArticle(
  liveFeed: LiveFeed,
  profilesService: ProfilesService,
  doc: ArticleDoc,
) {
  try {
    const author = await profilesService.getProfile(doc.authorId);
    await liveFeed.publish({
      type: 'article-created',
      article: new ArticleDto(toArticle(doc), false, author).article,
    });
  } catch (err) {
    console.error('live update failed', err);
  }
}

export {announceArticle};
