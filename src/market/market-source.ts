import {SqlStorage} from '../db';
import {UpstreamError} from '../errors';
import {Quality} from './daily-stats';
import {ItemHistory, ItemSeries} from './item-history';
import {MarketScope} from './market-scopes';
import {UniversalisFetch, universalisSales} from './universalis';

// Where the page's price histories come from. In the Worker, a Durable
// Object per item and place (market-hub.ts), which keeps reading older
// sales between requests; elsewhere (tests), LocalMarket.
interface MarketSource {
  history(
    scope: MarketScope,
    itemId: number,
    quality: Quality,
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

  async history(scope: MarketScope, itemId: number, quality: Quality) {
    const key = `${scope.id}:${itemId}`;
    let item = this.items.get(key);
    if (!item) {
      item = new ItemHistory(
        this.newStorage(),
        universalisSales(this.fetchHistory, scope.name, itemId),
        this.now,
        this.options.chunk,
      );
      this.items.set(key, item);
    }
    item.plan();
    const steps = this.options.stepsPerRequest ?? Infinity;
    for (let step = 0; step < steps && (await item.step()); step++);
    return item.series(quality);
  }
}

// Without a market (an app made without one), the page says so.
const noMarket: MarketSource = {
  async history() {
    throw new UpstreamError("The market board's history isn't available here.");
  },
};

export {LocalMarket, MarketSource, noMarket};
