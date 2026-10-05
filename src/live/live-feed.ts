// Events pushed to everyone connected to GET /api/live. They say what
// changed, not what to show: a page fetches what it needs, so nothing
// personal (favourites, follows) is ever broadcast.
type LiveEvent = {
  type: 'article-created';
  slug: string;
  author: string;
  tags: string[];
};

// Sends an event to every connected client.
interface LiveFeed {
  publish(event: LiveEvent): Promise<void>;
}

// For tests and anywhere without a hub: publishes nothing.
const noLiveFeed: LiveFeed = {publish: async () => {}};

export {LiveEvent, LiveFeed, noLiveFeed};
