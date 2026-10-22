import {QUALITIES} from './daily-stats';

// One quality's sales on a world in a day.
interface Figures {
  // The middle price per unit: a few sales at silly prices (gil moved
  // between characters) don't sway it, as they would an average.
  median: number;
  min: number;
  max: number;
  sales: number;
  quantity: number;
}

type Quality = (typeof QUALITIES)[number];

// A world's day: each quality's figures, null when none of it sold.
interface WorldDay {
  world: number;
  // The day's start (UTC midnight, s since the epoch).
  day: number;
  all: Figures;
  nq: Figures | null;
  hq: Figures | null;
}

// One quality's days on each world, the oldest first.
interface ItemSeries {
  days: {world: number; day: number; figures: Figures}[];
  // Every day asked for has been read (until then, older days are still
  // coming in).
  complete: boolean;
  // While not complete: the oldest day read on every world so far.
  readBackTo: number | null;
  // When the newest sales were last read.
  refreshedAt: Date | null;
}

// A world of the region: its game id (as kept) and name (as Universalis
// takes it).
interface World {
  id: number;
  name: string;
}

// An item that can be sold on the market board.
interface MarketItem {
  id: number;
  name: string;
  // Its icon: an id for GET /api/market/icons/:id.
  icon: number;
  // Comes in high quality too.
  canBeHq: boolean;
  // Its market board category ("Stone", "Medicine").
  category: string;
}

interface CurrentListings {
  listings: Listing[];
  // When any of the region's market boards was last uploaded.
  updatedAt: Date | null;
}

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

// A region of the game: its worlds can all be reached from each other (and
// any world can visit Oceania). Ids are the names in lower case with dashes
// ("north-america"), as links carry them; Universalis' name joins the words
// with a dash too ("North-America").
interface MarketRegion {
  id: string;
  name: string;
  universalis: string;
  dataCentres: {name: string; worlds: {id: number; name: string}[]}[];
}

// A window of sales to read: those made in [until - within, until] (s),
// the newest first, at most `limit` of them.
interface SalesWindow {
  until: number;
  within: number;
  limit: number;
}

export {
  CurrentListings,
  Figures,
  ItemSeries,
  Listing,
  MarketItem,
  MarketRegion,
  Quality,
  SalesWindow,
  World,
  WorldDay,
};
