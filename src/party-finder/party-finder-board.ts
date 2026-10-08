import {
  DATA_CENTRES,
  DATA_CENTRE_NAMES,
  DataCentre,
  dataCentreOf,
} from './data-centres';
import {PartyFinderListing, XivpfListing, toListing} from './xivpf-listing';

// How the board reaches xivpf; tests pass a fake.
type XivpfFetch = (
  url: string,
) => Promise<{ok: boolean; status: number; text(): Promise<string>}>;

// One data centre's listings, as the page gets them.
interface Board {
  dataCentre: DataCentre;
  worlds: readonly {id: number; name: string}[];
  // When the site last read xivpf.
  fetchedAt: string;
  listings: PartyFinderListing[];
}

// Where the router gets boards: the board itself, or (in the Worker) the
// Durable Object that holds it. Null while xivpf can't be reached.
interface PartyFinderSource {
  board(dataCentre: DataCentre): Promise<Board | null>;
}

// xivpf has no filters: this is every listing in the game, about 1.3 MB.
const XIVPF_LISTINGS = 'https://xivpf.com/api/listings';
// xivpf is asked at most this often, and only while someone is looking.
// Its listings are refreshed by players' plugins every few minutes anyway.
const REFRESH_MS = 60 * 1000;
// When xivpf can't be reached, the last listings stay this long.
const STALE_MS = 15 * 60 * 1000;
// A listing nobody's plugin has reported for this long is taken as gone.
// xivpf only hears of listings players see: one that filled up or was taken
// down stays there until its timer would have run out (up to an hour),
// while live ones are reported every minute or two. Without this the page
// showed three times what the game does.
const UNSEEN_MS = 5 * 60 * 1000;

// The Party Finder listings of the data centres the site follows, read from
// xivpf and kept between requests. Parsing xivpf's whole answer takes more
// CPU than a Worker request may use on the Free plan, so in the Worker this
// runs in a Durable Object (PartyFinderHub).
class PartyFinderBoard implements PartyFinderSource {
  private snapshot?: {
    at: number;
    listings: Record<DataCentre, PartyFinderListing[]>;
  };
  private attemptedAt = -Infinity;
  private refreshing?: Promise<void>;

  constructor(
    private readonly fetchFn: XivpfFetch,
    private readonly now: () => Date,
  ) {}

  async board(dataCentre: DataCentre): Promise<Board | null> {
    if (this.now().getTime() - this.attemptedAt >= REFRESH_MS) {
      await this.refresh();
    } else if (this.refreshing) {
      await this.refreshing;
    }
    if (!this.snapshot) return null;
    const now = this.now().getTime();
    return {
      dataCentre,
      worlds: DATA_CENTRES[dataCentre],
      fetchedAt: new Date(this.snapshot.at).toISOString(),
      listings: this.snapshot.listings[dataCentre].filter(
        listing =>
          Date.parse(listing.expiresAt) > now &&
          now - Date.parse(listing.updatedAt) <= UNSEEN_MS,
      ),
    };
  }

  // One read at a time: requests arriving meanwhile wait for it.
  private refresh() {
    this.refreshing ??= this.read().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async read() {
    const at = this.now().getTime();
    this.attemptedAt = at;
    try {
      const response = await this.fetchFn(XIVPF_LISTINGS);
      if (!response.ok) throw new Error(`xivpf answered ${response.status}`);
      const all: unknown = JSON.parse(await response.text());
      if (!Array.isArray(all)) throw new Error('xivpf sent no list');
      this.snapshot = {at, listings: byDataCentre(all)};
    } catch (error) {
      console.error('Party Finder: reading xivpf failed', error);
      if (this.snapshot && at - this.snapshot.at > STALE_MS) {
        this.snapshot = undefined;
      }
    }
  }
}

// Every data centre's listings, the latest first, each once. xivpf keeps a
// listing per world it was reported on, so one whose recruiter changed
// worlds can be there twice: the latest report is the one kept. Entries
// that don't have the expected shape are skipped.
function byDataCentre(all: unknown[]) {
  const latest = new Map<DataCentre, Map<string, PartyFinderListing>>(
    DATA_CENTRE_NAMES.map(name => [name, new Map()]),
  );
  for (const entry of all) {
    try {
      const xivpf = entry as XivpfListing;
      const dataCentre = dataCentreOf(xivpf.listing.created_world.id);
      const listings = dataCentre && latest.get(dataCentre);
      if (!listings) continue;
      const listing = toListing(xivpf);
      const seen = listings.get(listing.id);
      if (!seen || listing.updatedAt > seen.updatedAt) {
        listings.set(listing.id, listing);
      }
    } catch {
      // Not a listing we understand.
    }
  }
  return Object.fromEntries(
    [...latest].map(([name, listings]) => [
      name,
      [...listings.values()].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    ]),
  ) as Record<DataCentre, PartyFinderListing[]>;
}

export {
  Board,
  PartyFinderBoard,
  PartyFinderSource,
  REFRESH_MS,
  XIVPF_LISTINGS,
  XivpfFetch,
};
