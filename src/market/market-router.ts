import * as express from 'express';
import {route} from '../api';
import {XivApiClient} from '../duties';
import {NotFoundError} from '../errors';
import {ItemSeries} from './item-history';
import {MarketItems} from './market-items';
import {
  MarketHistoryQuery,
  MarketHistoryResponse,
  MarketIconParams,
  MarketItemsParams,
  MarketItemsQuery,
  MarketItemsResponse,
  MarketScopesResponse,
} from './market-schemas';
import {DEFAULT_SCOPE, marketScope, scopeList} from './market-scopes';
import {MarketSource} from './market-source';

// Icons and the places never change between game patches.
const LONG_CACHE = 'public, max-age=604800';

// The market board page: items to pick (XIVAPI), and their price history
// in a data centre or on a world (Universalis, through MarketSource), a
// point a day. Open to everyone.
class MarketRouter {
  constructor(
    private readonly items: MarketItems,
    private readonly market: MarketSource,
    private readonly xivApi: XivApiClient,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/market/scopes',
        summary: 'The data centres and worlds whose prices can be read',
        responses: {
          200: {description: 'The places.', schema: MarketScopesResponse},
        },
      },
      async (_req, res) => {
        res
          .set('Cache-Control', LONG_CACHE)
          .json({regions: scopeList(), defaultScope: DEFAULT_SCOPE});
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/market/items',
        summary: 'Items the market board sells, by name',
        query: MarketItemsQuery,
        responses: {
          200: {description: 'The items found.', schema: MarketItemsResponse},
        },
      },
      async (req, res) => {
        const items = await this.items.search(req.query.search);
        res.set('Cache-Control', 'public, max-age=3600').json({items});
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/market/items/:ids',
        summary: 'Items the market board sells, by id (1,2,3)',
        params: MarketItemsParams,
        responses: {
          200: {description: 'The items.', schema: MarketItemsResponse},
        },
      },
      async (req, res) => {
        const items = await this.items.byIds(itemIds(req.params.ids));
        res.set('Cache-Control', 'public, max-age=3600').json({items});
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
        summary: "Items' prices a day, in a data centre or on a world",
        query: MarketHistoryQuery,
        responses: {
          200: {
            description: "Each item's days.",
            schema: MarketHistoryResponse,
          },
        },
      },
      async (req, res) => {
        const {quality} = req.query;
        const scope = marketScope(req.query.scope);
        // The query's enum only lets known places through.
        if (!scope) throw new NotFoundError("There's no such place.");
        const ids = [...new Set(itemIds(req.query.items))];
        const series = await Promise.all(
          ids.map(id => this.market.history(scope, id, quality)),
        );
        const complete = series.every(item => item.complete);
        res.set('Cache-Control', complete ? 'public, max-age=300' : 'no-store');
        res.json({
          scope,
          quality,
          items: ids.map((id, i) => ({id, ...days(series[i])})),
        });
      },
    );

    return router;
  }
}

function itemIds(list: string) {
  return list.split(',').map(Number);
}

function days({points, complete, refreshedAt}: ItemSeries) {
  return {
    days: points.map(({day, median, min, max, sales, quantity}) => ({
      day: new Date(day * 1000).toISOString().slice(0, 10),
      median,
      min,
      max,
      sales,
      quantity,
    })),
    complete,
    refreshedAt: refreshedAt?.toISOString() ?? null,
  };
}

export {MarketRouter};
