import {Doc} from '../db';
import {DataCentre} from '../party-finder';
import {RelayMessage} from './discord-dto';

// The Everise Discord's channels the site relays: the weekly one (the
// Fashion Report and Island Sanctuary channels it follows) and the hunt
// trains (the hunt groups' channels it follows).
type RelayChannel = 'weekly' | 'hunts';

// The newest message of a channel already looked at (id: the channel).
interface RelayCursorDoc extends Doc {
  lastId: string;
}

type RelayKind = 'fashion-report' | 'island-sanctuary' | 'hunt';

// A relayed message (id: Discord's message id).
interface RelayedPostDoc extends Doc {
  channel: RelayChannel;
  kind: RelayKind;
  // A hunt train's data centre, from the server it came from.
  dataCentre?: DataCentre;
  postedAt: Date;
  // When a hunt train starts (the time in its text, or when it was posted).
  startsAt?: Date;
  message: RelayMessage;
}

interface RelaySettings {
  weeklyChannelId?: string;
  huntsChannelId?: string;
  // Which data centre each hunt group's channel is for, by channel id (or
  // by server id, for a group with one channel).
  huntSources: Record<string, DataCentre>;
}

export {RelayChannel, RelayCursorDoc, RelayKind, RelaySettings, RelayedPostDoc};
