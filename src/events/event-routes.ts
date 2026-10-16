import {Db} from '../db';
import {DiscordAnnouncer} from '../discord';
import {Auth} from '../middleware';
import {ProfilesService} from '../profiles';
import {EventsFetch} from './event';
import {EventPages} from './event-pages';
import {EventSharesService} from './event-shares-service';
import {EventsBoard} from './events-board';
import {EventsRouter} from './events-router';

// Everything the Events need, put together for the app (src/app.ts): the
// week's events, each event's page, and sharing an event in Discord.
interface EventParts {
  auth: Auth;
  db: Db;
  fetch: EventsFetch;
  profilesService: ProfilesService;
  discord: DiscordAnnouncer;
  now: () => Date;
}

function eventRoutes(parts: EventParts) {
  const pages = new EventPages(parts.fetch, parts.now);
  const shares = new EventSharesService(
    parts.db,
    pages,
    parts.profilesService,
    parts.discord,
    parts.now,
  );
  return new EventsRouter(
    parts.auth,
    new EventsBoard(parts.fetch, parts.now),
    pages,
    shares,
  ).router;
}

export {eventRoutes};
