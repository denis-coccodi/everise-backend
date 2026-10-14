import * as express from 'express';
import {route} from '../api';
import {XivApiClient} from '../duties';
import {NotFoundError} from '../errors';
import {Auth} from '../middleware';
import {DAY, dayOf} from './daily-stats';
import {HISTORY_START, ItemSeries} from './item-history';
import {MarketItems} from './market-items';
import {MarketListings} from './market-listings';
import {
  DEFAULT_REGION,
  HOME_WORLD,
  marketRegion,
  marketRegions,
} from './market-regions';
import {
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
} from './market-schemas';
import {MarketSource} from './market-source';

// Icons and the regions never change between game patches.
const LONG_CACHE = 'public, max-age=604800';
// The days a history starts with when none is asked for.
const DEFAULT_DAYS = 30;

// The market history page: an item to pick (XIVAPI), and its price history
// on each world of a region (Universalis, through MarketSource), a point a
// world and day. Reading histories and searching items costs Universalis
// and XIVAPI reads and storage writes, so those need a signed-in member;
// the regions and the icons (cached at the edge) are open to everyone.
class MarketRouter {
  constructor(
    private readonly auth: Auth,
    private readonly items: MarketItems,
    private readonly market: MarketSource,
    private readonly listings: MarketListings,
    private readonly xivApi: XivApiClient,
    private readonly now: () => Date,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/market/regions',
        summary: 'The regions, data centres and worlds whose prices are read',
        responses: {
          200: {description: 'The regions.', schema: MarketRegionsResponse},
        },
      },
      async (_req, res) => {
        res.set('Cache-Control', LONG_CACHE).json({
          regions: marketRegions().map(({id, name, dataCentres}) => ({
            id,
            name,
            dataCentres,
          })),
          defaultRegion: DEFAULT_REGION,
          homeWorld: HOME_WORLD,
          historyStart: dayString(HISTORY_START),
        });
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/market/items',
        summary: 'Items the market board sells, by name',
        auth: this.auth.required,
        query: MarketItemsQuery,
        responses: {
          200: {description: 'The items found.', schema: MarketItemsResponse},
        },
      },
      async (req, res) => {
        const items = await this.items.search(req.query.search);
        res.set('Cache-Control', 'private, max-age=3600').json({items});
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/market/items/:id',
        summary: 'An item the market board sells, by id',
        auth: this.auth.required,
        params: MarketItemParams,
        responses: {
          200: {description: 'The item.', schema: MarketItemResponse},
        },
      },
      async (req, res) => {
        const [item] = await this.items.byIds([Number(req.params.id)]);
        if (!item) {
          throw new NotFoundError("The market board doesn't sell that item.");
        }
        res.set('Cache-Control', 'private, max-age=3600').json({item});
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/market/icons/:id',
        summary: "An item's icon",
        params: MarketIconParams,
        responses: {200: {description: 'The icon.', contentType: 'image/*'}},
      },
      async (req, res) => {
        const bytes = await this.xivApi.fetchImage({
          id: Number(req.params.id),
          format: 'png',
        });
        if (!bytes) throw new NotFoundError("There's no such icon.");
        res
          .type('image/png')
          .set('Cache-Control', LONG_CACHE)
          .send(Buffer.from(bytes));
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/market/history',
        summary: "An item's prices a day on each world of a region",
        auth: this.auth.required,
        query: MarketHistoryQuery,
        responses: {
          200: {
            description: "Each world's days.",
            schema: MarketHistoryResponse,
          },
        },
      },
      async (req, res) => {
        const {quality} = req.query;
        const region = marketRegion(req.query.region);
        // The query's enum only lets known regions through.
        if (!region) throw new NotFoundError("There's no such region.");
        const item = Number(req.query.item);
        const from = this.firstDay(req.query.from);
        const series = await this.market.history(region, item, quality, from);
        res.set(
          'Cache-Control',
          series.complete ? 'private, max-age=300' : 'no-store',
        );
        res.json({
          region: {id: region.id, name: region.name},
          item,
          quality,
          from: dayString(from),
          ...byWorld(series),
        });
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/market/listings',
        summary: "An item's cheapest listings now on the worlds of a region",
        auth: this.auth.required,
        query: MarketListingsQuery,
        responses: {
          200: {description: 'The listings.', schema: MarketListingsResponse},
        },
      },
      async (req, res) => {
        const {quality} = req.query;
        const region = marketRegion(req.query.region);
        // The query's enum only lets known regions through.
        if (!region) throw new NotFoundError("There's no such region.");
        const item = Number(req.query.item);
        const {listings, updatedAt} = await this.listings.cheapest(
          region.universalis,
          item,
          quality,
        );
        // They change by the minute: a short while in the browser only.
        res.set('Cache-Control', 'private, max-age=60').json({
          region: {id: region.id, name: region.name},
          item,
          quality,
          listings: listings.map(listing => ({
            ...listing,
            reviewedAt: listing.reviewedAt.toISOString(),
          })),
          updatedAt: updatedAt?.toISOString() ?? null,
        });
      },
    );

    return router;
  }

  // The first day asked for (s), never before the history starts nor
  // after today; by default DEFAULT_DAYS ago.
  private firstDay(day: string | undefined) {
    const today = dayOf(this.now().getTime() / 1000);
    const asked = day ? Date.parse(`${day}T00:00:00Z`) / 1000 : NaN;
    const from = Number.isNaN(asked) ? today - DEFAULT_DAYS * DAY : asked;
    return Math.min(today, Math.max(HISTORY_START, dayOf(from)));
  }
}

function dayString(day: number) {
  return new Date(day * 1000).toISOString().slice(0, 10);
}

function byWorld({days, complete, refreshedAt}: ItemSeries) {
  const worlds = new Map<number, ReturnType<typeof marketDay>[]>();
  for (const {world, day, figures} of days) {
    const list = worlds.get(world);
    const shown = marketDay(day, figures);
    if (list) list.push(shown);
    else worlds.set(world, [shown]);
  }
  return {
    worlds: [...worlds].map(([id, worldDays]) => ({id, days: worldDays})),
    complete,
    refreshedAt: refreshedAt?.toISOString() ?? null,
  };
}

function marketDay(
  day: number,
  figures: ItemSeries['days'][number]['figures'],
) {
  return {day: dayString(day), ...figures};
}

export {MarketRouter};
