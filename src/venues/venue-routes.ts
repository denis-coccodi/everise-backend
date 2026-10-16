import {Db} from '../db';
import {DiscordAnnouncer} from '../discord';
import {EventsAtVenues} from '../events';
import {Auth} from '../middleware';
import {ProfilesService} from '../profiles';
import {VenuePages} from './venue-pages';
import {VenuePagesRouter} from './venue-pages-router';
import {VenueSharesService} from './venue-shares-service';
import {VenuesBoard, VenuesFetch} from './venues-board';
import {VenuesRouter} from './venues-router';

// Everything the Venues need, put together for the app (src/app.ts): the
// data centres' lists, each venue's page, and sharing a venue in Discord.
interface VenueParts {
  auth: Auth;
  db: Db;
  fetch: VenuesFetch;
  profilesService: ProfilesService;
  discord: DiscordAnnouncer;
  // The week's events at a venue, shown on its page.
  events: EventsAtVenues;
  now: () => Date;
}

function venueRoutes(parts: VenueParts) {
  const pages = new VenuePages(parts.fetch, parts.now);
  const shares = new VenueSharesService(
    parts.db,
    pages,
    parts.profilesService,
    parts.discord,
    parts.now,
  );
  return [
    new VenuesRouter(new VenuesBoard(parts.fetch, parts.now)).router,
    new VenuePagesRouter(parts.auth, pages, shares, parts.events).router,
  ];
}

export {venueRoutes};
