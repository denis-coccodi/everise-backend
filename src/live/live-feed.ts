import {LiveEvent} from './live-model';

// Sends an event to every connected client.
interface LiveFeed {
  publish(event: LiveEvent): Promise<void>;
}

// For tests and anywhere without a hub: publishes nothing.
const noLiveFeed: LiveFeed = {publish: async () => {}};

export {LiveFeed, noLiveFeed};
