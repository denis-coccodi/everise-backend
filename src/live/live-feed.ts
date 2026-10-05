import {ArticleDto} from '../articles/article-dto';

// Events pushed to everyone connected to GET /api/live.
type LiveEvent = {
  // A new post, as the API returns it to someone who isn't signed in
  // (favorited and author.following are false): nothing personal is ever
  // broadcast. Pages insert it into their lists as it is.
  type: 'article-created';
  article: ArticleDto['article'];
};

// Sends an event to every connected client.
interface LiveFeed {
  publish(event: LiveEvent): Promise<void>;
}

// For tests and anywhere without a hub: publishes nothing.
const noLiveFeed: LiveFeed = {publish: async () => {}};

export {LiveEvent, LiveFeed, noLiveFeed};
