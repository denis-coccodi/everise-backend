import {DurableObject} from 'cloudflare:workers';
import {UpstreamError} from '../errors';
import {Quality} from './daily-stats';
import {ItemHistory, ItemSeries, World} from './item-history';
import {MarketRegion, regionWorlds} from './market-regions';
import {MarketSource} from './market-source';
import {universalisSales} from './universalis';

// Steps an alarm reads before handing over to the next one: each reads up
// to 8 worlds (8 outbound requests), and an invocation may make 50 on the
// Free plan.
const STEPS_PER_ALARM = 4;
// The pause between alarms: none, so a long history fills in quickly
// (Universalis allows 8 connections and 25 requests a second).
const ALARM_PAUSE_MS = 0;
// Steps the first request waits for: at 8 worlds a step, every world of a
// region (Europe has 16, North America 32) gets its newest days.
const FIRST_STEPS = 4;
// After a failed read, the wait before trying again.
const RETRY_MS = 15 * 1000;

interface ItemKey {
  itemId: number;
  // The region's worlds, read one by one.
  worlds: World[];
}

// One item's price history in one region (its name: "<region id>:<item
// id>", e.g. "europe:5111"), in the object's own SQLite storage. A request
// answers what's kept, after reading the newest sales if nothing is kept
// yet; alarms read the rest of the days asked for while nobody waits. A
// Durable Object may also use far more CPU than a Worker request on the
// Free plan, which reading thousands of sales at a time needs.
//
// The class first kept one history per item and world or data centre
// (migration v4); its objects then had other names and tables, so the two
// never meet and no migration was needed.
class MarketHistoryHub extends DurableObject {
  private item?: ItemHistory;

  // A failed read comes back as its message: an error thrown across RPC
  // loses its class, and with it the answer the API gives.
  async history(
    worlds: World[],
    itemId: number,
    quality: Quality,
    from: number,
    to: number | null,
  ): Promise<{series: ItemSeries} | {error: string}> {
    const key: ItemKey = {itemId, worlds};
    // Kept for the alarms, once: every write counts against the Free plan.
    if (!this.item && !(await this.ctx.storage.get('item'))) {
      await this.ctx.storage.put('item', key);
    }
    const item = this.itemHistory(key);
    item.plan(from);
    try {
      if (!item.hasDays) {
        for (let step = 0; step < FIRST_STEPS && (await item.step()); step++);
      }
    } catch (error) {
      if (item.pending()) await this.wake(RETRY_MS);
      return {error: error instanceof Error ? error.message : String(error)};
    }
    if (item.pending()) await this.wake(0);
    return {series: item.series(quality, from, to)};
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
    if (item.pending()) await this.wake(ALARM_PAUSE_MS);
  }

  private itemHistory(key: ItemKey) {
    this.item ??= new ItemHistory(
      this.ctx.storage,
      key.worlds,
      universalisSales((url, init) => fetch(url, init), key.itemId),
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

  async history(
    region: MarketRegion,
    itemId: number,
    quality: Quality,
    from: number,
    to: number | null,
  ) {
    // RPC stubs drop the method's types: typed once here.
    const answer = (await this.hubs
      .getByName(`${region.id}:${itemId}`)
      .history(regionWorlds(region), itemId, quality, from, to)) as
      {series: ItemSeries} | {error: string};
    if ('error' in answer) throw new UpstreamError(answer.error);
    return answer.series;
  }
}

export {HubMarket, MarketHistoryHub};
