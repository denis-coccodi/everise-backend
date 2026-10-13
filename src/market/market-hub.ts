import {DurableObject} from 'cloudflare:workers';
import {UpstreamError} from '../errors';
import {Quality} from './daily-stats';
import {ItemHistory, ItemSeries} from './item-history';
import {MarketScope} from './market-scopes';
import {MarketSource} from './market-source';
import {universalisSales} from './universalis';

// Steps an alarm reads before handing over to the next one: each is one
// outbound request, and an invocation may make 50 on the Free plan.
const STEPS_PER_ALARM = 4;
// The pause between alarms, to go easy on Universalis.
const ALARM_PAUSE_MS = 1000;
// After a failed read, the wait before trying again.
const RETRY_MS = 15 * 1000;

interface ItemKey {
  scope: string;
  itemId: number;
}

// One item's price history in one place (its name: "<scope id>:<item id>"),
// in the object's own SQLite storage. A request answers what's kept, after
// reading the newest sales if nothing is kept yet; alarms read the rest,
// back to the oldest sale Universalis keeps, while nobody waits. A Durable
// Object may also use far more CPU than a Worker request on the Free plan,
// which reading thousands of sales at a time needs.
class MarketHistoryHub extends DurableObject {
  private item?: ItemHistory;

  // A failed read comes back as its message: an error thrown across RPC
  // loses its class, and with it the answer the API gives.
  async history(
    scope: string,
    itemId: number,
    quality: Quality,
  ): Promise<{series: ItemSeries} | {error: string}> {
    const key: ItemKey = {scope, itemId};
    await this.ctx.storage.put('item', key);
    const item = this.itemHistory(key);
    item.plan();
    try {
      if (item.series('all').points.length === 0) await item.step();
    } catch (error) {
      if (item.pending) await this.wake(RETRY_MS);
      return {error: error instanceof Error ? error.message : String(error)};
    }
    if (item.pending) await this.wake(0);
    return {series: item.series(quality)};
  }

  async alarm() {
    const key = await this.ctx.storage.get<ItemKey>('item');
    if (!key) return;
    const item = this.itemHistory(key);
    try {
      for (let step = 0; step < STEPS_PER_ALARM && (await item.step()); step++);
    } catch (error) {
      console.error('Market: reading Universalis failed', error);
      await this.wake(RETRY_MS);
      return;
    }
    if (item.pending) await this.wake(ALARM_PAUSE_MS);
  }

  private itemHistory(key: ItemKey) {
    this.item ??= new ItemHistory(
      this.ctx.storage,
      universalisSales((url, init) => fetch(url, init), key.scope, key.itemId),
      () => new Date(),
    );
    return this.item;
  }

  private async wake(afterMs: number) {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + afterMs);
    }
  }
}

// Reads the histories through their objects.
class HubMarket implements MarketSource {
  constructor(
    private readonly hubs: DurableObjectNamespace<MarketHistoryHub>,
  ) {}

  async history(scope: MarketScope, itemId: number, quality: Quality) {
    // RPC stubs drop the method's types: typed once here.
    const answer = (await this.hubs
      .getByName(`${scope.id}:${itemId}`)
      .history(scope.name, itemId, quality)) as
      {series: ItemSeries} | {error: string};
    if ('error' in answer) throw new UpstreamError(answer.error);
    return answer.series;
  }
}

export {HubMarket, MarketHistoryHub};
