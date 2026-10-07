import {DATA_CENTRES, DataCentre, dataCentreOf} from './data-centres';
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
        listing => Date.parse(listing.expiresAt) > now,
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

// The followed data centres' listings, the latest first. Entries that don't
// have the expected shape are skipped.
function byDataCentre(all: unknown[]) {
  const listings: Record<DataCentre, PartyFinderListing[]> = {
    Light: [],
    Chaos: [],
  };
  for (const entry of all) {
    try {
      const xivpf = entry as XivpfListing;
      const dataCentre = dataCentreOf(xivpf.listing.created_world.id);
      if (dataCentre) listings[dataCentre].push(toListing(xivpf));
    } catch {
      // Not a listing we understand.
    }
  }
  for (const list of Object.values(listings)) {
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return listings;
}

export {
  Board,
  PartyFinderBoard,
  PartyFinderSource,
  REFRESH_MS,
  XIVPF_LISTINGS,
  XivpfFetch,
};
