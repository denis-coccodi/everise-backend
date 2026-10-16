import {Db} from '../db';
import {DiscordAnnouncer} from '../discord';
import {Auth} from '../middleware';
import {ProfilesService} from '../profiles';
import {EventsFetch} from './event';
import {EventPages} from './event-pages';
import {EventsAtVenues, VenueLookup} from './event-places';
import {EventSharesService} from './event-shares-service';
import {EventsBoard} from './events-board';
import {EventsRouter} from './events-router';

// Everything the Events need, put together for the app (src/app.ts): the
// week's events, each event's page, and sharing an event in Discord; and
// the week's events at a venue, for the venues' pages (from the same
// board, so both share one read of Partake).
interface EventParts {
  auth: Auth;
  db: Db;
  fetch: EventsFetch;
  profilesService: ProfilesService;
  discord: DiscordAnnouncer;
  // The venue an event is held at, for its page.
  venueAt?: VenueLookup;
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
  const board = new EventsBoard(parts.fetch, parts.now);
  return {
    router: new EventsRouter(
      parts.auth,
      board,
      pages,
      shares,
      parts.venueAt ?? (async () => null),
    ).router,
    atVenues: new EventsAtVenues(board),
  };
}

export {eventRoutes};
