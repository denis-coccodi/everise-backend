import type {ArticlesService} from '../articles';
import {Db} from '../db';
import {DiscordAnnouncer} from '../discord';
import {MediaService} from '../media';
import {Auth} from '../middleware';
import {NotificationsService} from '../notifications';
import {
  DutiesByName,
  PartyFinderReader,
  PartyFinderRouter,
  PartyFinderSource,
} from '../party-finder';
import {ProfilesService} from '../profiles';
import {PartyFinderSharesRouter} from './party-finder-shares-router';
import {PartyFinderSharesService} from './party-finder-shares-service';
import {SharedListings} from './shared-listings';

// Everything the Party Finder needs, put together for the app (src/app.ts):
// the listings (from the source: xivpf, through a Durable Object in the
// Worker), sharing them, and watching the shared ones until they end.
interface PartyFinderParts {
  auth: Auth;
  db: Db;
  source: PartyFinderSource;
  dutiesByName: DutiesByName;
  articlesService: ArticlesService;
  profilesService: ProfilesService;
  discord: DiscordAnnouncer;
  mediaService: MediaService;
  notifications: NotificationsService;
  now: () => Date;
}

// The Party Finder's routers, and the shared listings, which the Worker's
// cron trigger checks.
function partyFinderRoutes(parts: PartyFinderParts) {
  const reader = new PartyFinderReader(
    parts.source,
    parts.dutiesByName,
    parts.now,
  );
  const sharedListings = new SharedListings(
    parts.db,
    reader,
    parts.notifications,
    parts.discord,
    parts.now,
  );
  const shares = new PartyFinderSharesService(
    parts.db,
    reader,
    parts.articlesService,
    parts.profilesService,
    parts.discord,
    parts.mediaService,
    sharedListings,
    parts.now,
  );
  return {
    routers: [
      new PartyFinderRouter(reader).router,
      new PartyFinderSharesRouter(parts.auth, shares, parts.profilesService)
        .router,
    ],
    sharedListings,
  };
}

export {partyFinderRoutes};
