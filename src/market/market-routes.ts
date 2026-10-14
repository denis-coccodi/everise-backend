import {HttpGet, XivApiClient} from '../duties';
import {Auth} from '../middleware';
import {MarketItems} from './market-items';
import {MarketListings} from './market-listings';
import {MarketRouter} from './market-router';
import {MarketSource} from './market-source';
import {UniversalisFetch} from './universalis';

// Everything the market history page needs, put together for the app
// (src/app.ts): items from XIVAPI, histories from the MarketSource, and the
// current listings from Universalis.
interface MarketParts {
  auth: Auth;
  httpGet: HttpGet;
  xivApiClient: XivApiClient;
  market: MarketSource;
  universalis: UniversalisFetch;
  now: () => Date;
}

function marketRouter(parts: MarketParts) {
  return new MarketRouter(
    parts.auth,
    new MarketItems(parts.httpGet),
    parts.market,
    new MarketListings(parts.universalis),
    parts.xivApiClient,
    parts.now,
  ).router;
}

export {marketRouter};
