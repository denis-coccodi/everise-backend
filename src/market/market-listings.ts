import {UpstreamError} from '../errors';
import {Quality} from './daily-stats';
import {UniversalisFetch} from './universalis';

const UNIVERSALIS_URL = 'https://universalis.app/api/v2';
const HEADERS = {'User-Agent': 'Everise (https://everise.dev)'};

// Listings answered: the cheapest first.
const LISTINGS = 5;

// An item for sale on a world's market board now.
interface Listing {
  // The game's world id.
  world: number;
  // Gil per unit, before tax.
  price: number;
  quantity: number;
  hq: boolean;
  // When a player's upload last saw it (sellers undercut each other, so the
  // cheapest moves).
  reviewedAt: Date;
}

interface CurrentListings {
  listings: Listing[];
  // When any of the region's market boards was last uploaded.
  updatedAt: Date | null;
}

// The cheapest listings of an item on any world of a region right now, from
// Universalis (one quick request: it keeps every world's current listings
// sorted by price). Nothing is stored: they change by the minute.
class MarketListings {
  constructor(private readonly fetchListings: UniversalisFetch) {}

  async cheapest(
    region: string,
    itemId: number,
    quality: Quality,
  ): Promise<CurrentListings> {
    const hq = quality === 'all' ? '' : `&hq=${quality === 'hq'}`;
    const url =
      `${UNIVERSALIS_URL}/${encodeURIComponent(region)}/${itemId}` +
      `?listings=${LISTINGS}&entries=0${hq}`;
    const response = await this.fetchListings(url, {headers: HEADERS}).catch(
      () => null,
    );
    // An item the market board doesn't sell: nothing listed.
    if (response?.status === 404) return {listings: [], updatedAt: null};
    if (!response?.ok) {
      console.error(
        `Market: Universalis answered ${response?.status ?? 'nothing'} for ${url}`,
      );
      throw new UpstreamError(
        "The market board's listings can't be read right now. Try again in a minute.",
      );
    }
    return toListings(await response.json());
  }
}

function toListings(body: unknown): CurrentListings {
  const answer = (body && typeof body === 'object' ? body : {}) as Record<
    string,
    unknown
  >;
  const entries = Array.isArray(answer.listings) ? answer.listings : [];
  const listings = entries.flatMap((entry: Record<string, unknown>) => {
    const world = Number(entry.worldID);
    const price = Number(entry.pricePerUnit);
    const quantity = Number(entry.quantity);
    const reviewed = Number(entry.lastReviewTime);
    if (!(world > 0 && price >= 0 && quantity > 0 && reviewed > 0)) return [];
    return [
      {
        world,
        price,
        quantity,
        hq: entry.hq === true,
        reviewedAt: new Date(reviewed * 1000),
      },
    ];
  });
  const uploaded = Number(answer.lastUploadTime);
  return {
    listings: listings.sort((a, b) => a.price - b.price).slice(0, LISTINGS),
    updatedAt: uploaded > 0 ? new Date(uploaded) : null,
  };
}

export {CurrentListings, Listing, MarketListings};
