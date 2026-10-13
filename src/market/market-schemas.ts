import {z} from 'zod';
import {isoDate, responseSchema} from '../api';
import {QUALITIES} from './daily-stats';
import {DEFAULT_SCOPE, SCOPE_IDS} from './market-scopes';

// Items one chart compares.
const MAX_ITEMS = 3;

const ITEM_IDS = new RegExp(`^\\d{1,7}(,\\d{1,7}){0,${MAX_ITEMS - 1}}$`);
const ITEM_IDS_ERROR = `Pick 1 to ${MAX_ITEMS} items: their ids, separated by commas.`;

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

const MarketItemsQuery = z.object({
  search: z
    .string()
    .trim()
    .min(2, {error: 'Type at least 2 letters of the item.'})
    .max(60, {error: 'Keep the search to 60 letters.'}),
});

const MarketItemsParams = z.object({
  ids: z.string().regex(ITEM_IDS, {error: ITEM_IDS_ERROR}),
});

const MarketIconParams = z.object({
  id: z.string().regex(/^\d{1,7}$/, {error: "That isn't an icon's id."}),
});

const Place = z.strictObject({id: z.string(), name: z.string()});

const MarketScopesResponse = responseSchema(
  'MarketScopesResponse',
  z.strictObject({
    // The data centres and their worlds, by region (ids: names in lower case).
    regions: z.array(
      z.strictObject({
        name: z.string(),
        dataCentres: z.array(Place.extend({worlds: z.array(Place)})),
      }),
    ),
    // Where the page starts.
    defaultScope: z.string(),
  }),
);

const MarketHistoryQuery = z.object({
  scope: z
    .enum(SCOPE_IDS, {
      error: "Pick one of the game's data centres or worlds, in lower case.",
    })
    .default(DEFAULT_SCOPE),
  items: z.string().regex(ITEM_IDS, {error: ITEM_IDS_ERROR}),
  quality: z.enum(QUALITIES, {error: 'Pick all, nq or hq.'}).default('all'),
});

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
    scope: z.strictObject({
      id: z.string(),
      name: z.string(),
      kind: z.enum(['dataCentre', 'world']),
    }),
    quality: z.enum(QUALITIES),
    items: z.array(
      z.strictObject({
        id: z.number().int(),
        // The days with sales, the oldest first: the first is as far back as
        // the history goes (once complete).
        days: z.array(MarketDay),
        // Every sale Universalis keeps has been read. Until then the oldest
        // days are still coming in: ask again in a few seconds.
        complete: z.boolean(),
        refreshedAt: isoDate.nullable(),
      }),
    ),
  }),
);

export {
  MAX_ITEMS,
  MarketHistoryQuery,
  MarketHistoryResponse,
  MarketIconParams,
  MarketItemsParams,
  MarketItemsQuery,
  MarketItemsResponse,
  MarketScopesResponse,
};
