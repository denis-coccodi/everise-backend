import {SqlStorage} from '../db';
import {UpstreamError} from '../errors';
import {Quality} from './daily-stats';
import {ItemHistory, ItemSeries} from './item-history';
import {MarketRegion, regionWorlds} from './market-regions';
import {UniversalisFetch, universalisSales} from './universalis';

// Where the page's price histories come from. In the Worker, a Durable
// Object per item and region (market-hub.ts), which keeps reading older
// sales between requests; elsewhere (tests), LocalMarket.
interface MarketSource {
  // `quality`'s days from `from` (s) on each of the region's worlds.
  history(
    region: MarketRegion,
    itemId: number,
    quality: Quality,
    from: number,
  ): Promise<ItemSeries>;
}

// The histories in this process, each in a storage of its own. A request
// reads at most `stepsPerRequest` windows of sales; the rest come with the
// next requests.
class LocalMarket implements MarketSource {
  private readonly items = new Map<string, ItemHistory>();

  constructor(
    private readonly newStorage: () => SqlStorage,
    private readonly fetchHistory: UniversalisFetch,
    private readonly now: () => Date,
    private readonly options: {chunk?: number; stepsPerRequest?: number} = {},
  ) {}

  async history(
    region: MarketRegion,
    itemId: number,
    quality: Quality,
    from: number,
  ) {
    const key = `${region.id}:${itemId}`;
    let item = this.items.get(key);
    if (!item) {
      item = new ItemHistory(
        this.newStorage(),
        regionWorlds(region),
        universalisSales(this.fetchHistory, itemId),
        this.now,
        this.options.chunk,
      );
      this.items.set(key, item);
    }
    item.plan(from);
    const steps = this.options.stepsPerRequest ?? Infinity;
    for (let step = 0; step < steps && (await item.step()); step++);
    return item.series(quality, from);
  }
}

// Without a market (an app made without one), the page says so.
const noMarket: MarketSource = {
  async history() {
    throw new UpstreamError("The market history isn't available here.");
  },
};

export {LocalMarket, MarketSource, noMarket};
