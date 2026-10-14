import {z} from 'zod';
import {isoDate, responseSchema} from '../api';
import {QUALITIES} from './daily-stats';
import {DEFAULT_REGION, REGION_IDS} from './market-regions';

const ITEM_ID = /^\d{1,7}$/;
const ITEM_ID_ERROR = "That isn't an item's id.";

const MarketItem = responseSchema(
  'MarketItem',
  z.strictObject({
    id: z.number().int(),
    name: z.string(),
    // An id for GET /api/market/icons/:id.
    icon: z.number().int(),
    canBeHq: z.boolean(),
    // The market board's category ("Stone", "Medicine").
    category: z.string(),
  }),
);

const MarketItemsResponse = responseSchema(
  'MarketItemsResponse',
  z.strictObject({items: z.array(MarketItem)}),
);

const MarketItemResponse = responseSchema(
  'MarketItemResponse',
  z.strictObject({item: MarketItem}),
);

const MarketItemsQuery = z.object({
  search: z
    .string()
    .trim()
    .min(2, {error: 'Type at least 2 letters of the item.'})
    .max(60, {error: 'Keep the search to 60 letters.'}),
});

const MarketItemParams = z.object({
  id: z.string().regex(ITEM_ID, {error: ITEM_ID_ERROR}),
});

const MarketIconParams = z.object({
  id: z.string().regex(/^\d{1,7}$/, {error: "That isn't an icon's id."}),
});

const MarketRegionsResponse = responseSchema(
  'MarketRegionsResponse',
  z.strictObject({
    // The regions (ids: names in lower case, words joined by dashes), their
    // data centres and worlds (game world ids). Oceania can be visited from
    // any region.
    regions: z.array(
      z.strictObject({
        id: z.string(),
        name: z.string(),
        dataCentres: z.array(
          z.strictObject({
            name: z.string(),
            worlds: z.array(
              z.strictObject({id: z.number().int(), name: z.string()}),
            ),
          }),
        ),
      }),
    ),
    // Where the page starts: Everise's region and home world.
    defaultRegion: z.string(),
    homeWorld: z.string(),
    // The first day of Universalis' history: no range starts earlier.
    historyStart: z.string(),
  }),
);

const MarketHistoryQuery = z.object({
  region: z
    .enum(REGION_IDS, {
      error: `Pick one of the game's regions: ${REGION_IDS.join(', ')}.`,
    })
    .default(DEFAULT_REGION),
  item: z.string().regex(ITEM_ID, {error: ITEM_ID_ERROR}),
  quality: z.enum(QUALITIES, {error: 'Pick all, nq or hq.'}).default('all'),
  // The first day wanted (YYYY-MM-DD); by default, 30 days ago.
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {error: 'Write the first day as YYYY-MM-DD.'})
    .optional(),
});

// The cheapest listings now: the history's query without the days.
const MarketListingsQuery = MarketHistoryQuery.omit({from: true});

const MarketListingsResponse = responseSchema(
  'MarketListingsResponse',
  z.strictObject({
    region: z.strictObject({id: z.string(), name: z.string()}),
    item: z.number().int(),
    quality: z.enum(QUALITIES),
    // The cheapest first (at most 5), on any world of the region.
    listings: z.array(
      z.strictObject({
        // The game's world id.
        world: z.number().int(),
        // Gil per unit, before tax.
        price: z.number().int(),
        quantity: z.number().int(),
        hq: z.boolean(),
        // When a player's upload last saw it.
        reviewedAt: isoDate,
      }),
    ),
    // When any of the region's market boards was last uploaded.
    updatedAt: isoDate.nullable(),
  }),
);

const MarketDay = z.strictObject({
  // The day (UTC), as YYYY-MM-DD.
  day: z.string(),
  // The middle price per unit that day, and the lowest and highest (gil).
  median: z.number().int(),
  min: z.number().int(),
  max: z.number().int(),
  // Sales that day, and the units they sold.
  sales: z.number().int(),
  quantity: z.number().int(),
});

const MarketHistoryResponse = responseSchema(
  'MarketHistoryResponse',
  z.strictObject({
    region: z.strictObject({id: z.string(), name: z.string()}),
    item: z.number().int(),
    quality: z.enum(QUALITIES),
    // The first day answered (YYYY-MM-DD).
    from: z.string(),
    // Each world that sold some, its days from `from` with sales, the
    // oldest first (a day without sales is missing).
    worlds: z.array(
      z.strictObject({id: z.number().int(), days: z.array(MarketDay)}),
    ),
    // Every day from `from` has been read. Until then the older days are
    // still coming in: ask again in a few seconds.
    complete: z.boolean(),
    refreshedAt: isoDate.nullable(),
  }),
);

export {
  MarketHistoryQuery,
  MarketHistoryResponse,
  MarketIconParams,
  MarketItemParams,
  MarketItemResponse,
  MarketItemsQuery,
  MarketItemsResponse,
  MarketListingsQuery,
  MarketListingsResponse,
  MarketRegionsResponse,
};
