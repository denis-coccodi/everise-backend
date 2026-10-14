import {Db} from '../db';
import {FileStore} from '../files';
import {DiscordChannel, RelayFetch} from './discord-channel';
import {RelayImages} from './relay-images';
import {RelaySync, huntSources} from './relay-sync';
import {RelaysRouter} from './relays-router';
import {RelaysService} from './relays-service';

interface RelayParts {
  db: Db;
  fileStore: FileStore;
  settings: {
    botToken?: string;
    weeklyChannelId?: string;
    huntsChannelId?: string;
    huntSources?: string;
    fetch?: RelayFetch;
  };
  now: () => Date;
}

// The Discord channels the site relays, put together for the app
// (src/app.ts): the router of the weekly page and the hunt trains, and the
// sync the Worker's cron trigger runs.
function relayRoutes({db, fileStore, settings, now}: RelayParts) {
  const channel = new DiscordChannel(settings.botToken, settings.fetch);
  const images = new RelayImages(fileStore, channel);
  const sources = huntSources(settings.huntSources ?? '');
  const sync = new RelaySync(
    db,
    channel,
    images,
    {
      weeklyChannelId: settings.weeklyChannelId,
      huntsChannelId: settings.huntsChannelId,
      huntSources: sources,
    },
    now,
  );
  const router = new RelaysRouter(
    new RelaysService(db, channel.available, sources, now),
    images,
  ).router;
  return {router, sync};
}

export {relayRoutes};
