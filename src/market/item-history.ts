import {SqlStorage} from '../db';
import {DAY, Figures, Quality, dayOf, worldDays} from './daily-stats';
import {MonthRows} from './month-rows';
import {ReadSales, Sale} from './universalis';

// Sales read per call to Universalis.
const CHUNK = 10_000;
// Worlds read at once (Universalis allows 8 connections at a time).
const CONCURRENCY = 8;
// How long the newest days are taken as up to date.
const STALE_MS = 15 * 60 * 1000;
// Universalis' history starts in late October 2022: nothing older is asked.
const HISTORY_START = Date.UTC(2022, 9, 1) / 1000;
// A world's read window adapts to how much it sells: it starts at
// FIRST_WINDOW, doubles while reads come back under a quarter full (a quiet
// world's whole history in a few reads), and halves when a read fills up (a
// busy world's answers stay small and quick).
const FIRST_WINDOW = 90 * DAY;
const MIN_WINDOW = 7 * DAY;
const MAX_WINDOW = 4 * 365 * DAY;

// A world of the region: its game id (as kept) and name (as Universalis
// takes it).
interface World {
  id: number;
  name: string;
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

interface Gap {
  id: number;
  world: number;
  since: number;
  until: number;
  // The next read's window (s).
  window: number;
}

// One item's price history on each world of a region, kept as each
// world's days (MonthRows: a row per world and month, every day inside).
// Only the days asked for are read: the first time, from `from` (a day) to
// now; later, older days when an earlier `from` is asked, and the days
// since the newest kept one once what's kept is STALE_MS old. What's still
// to read are gaps, one per world, read newest first, CONCURRENCY worlds at
// once. Universalis answers a limited number of sales at a time, the newest
// first: a read covers the gap's window (adapting to how busy the world is),
// starting on a day, and writes whole days only (when a read can't hold
// every sale of its window, its oldest day is read again, whole, by the next
// one). Kept days are never deleted.
class ItemHistory {
  // The step being read, if any.
  private running?: Promise<boolean>;
  // The days, a row per world and month.
  private readonly rows: MonthRows;

  constructor(
    private readonly storage: SqlStorage,
    private readonly worlds: World[],
    private readonly readSales: ReadSales,
    private readonly now: () => Date,
    private readonly chunk = CHUNK,
  ) {
    this.rows = new MonthRows(storage);
    for (const statement of TABLES) this.storage.sql.exec(statement);
  }

  // Adds what needs reading to show the days from `from` (s) to now.
  plan(from: number) {
    const start = Math.max(dayOf(from), HISTORY_START);
    const now = this.now().getTime();
    const nowSeconds = Math.floor(now / 1000);
    const readFrom = this.state('readFrom');
    const refreshedAt = this.state('refreshedAt');
    if (readFrom === null || refreshedAt === null) {
      this.addGaps(start, nowSeconds);
      this.setState('readFrom', start);
      this.setState('refreshedAt', now);
      return;
    }
    if (start < readFrom) {
      this.addGaps(start, readFrom - 1);
      this.setState('readFrom', start);
    }
    if (now - refreshedAt < STALE_MS) return;
    // From the newest day kept (read again, whole), or from the last read.
    const since = this.rows.newestDay() ?? dayOf(refreshedAt / 1000);
    if (this.gaps().some(gap => gap.until >= since)) return;
    this.addGaps(since, nowSeconds);
    this.setState('refreshedAt', now);
  }

  // Some day is kept.
  get hasDays() {
    return this.rows.hasDays;
  }

  // Something is left to read (to show the days from `from`, if given).
  pending(from = 0) {
    return this.gaps().some(gap => gap.until >= dayOf(from));
  }

  // Reads the newest gaps' next sales, a few worlds at once; false once
  // nothing is left to read. A step asked for while one runs (a request
  // during an alarm) shares it.
  step(): Promise<boolean> {
    this.running ??= this.readGaps().finally(() => (this.running = undefined));
    return this.running;
  }

  // `quality`'s days from `from` to `to` (s; null: to today), on each world
  // that sold some.
  series(quality: Quality, from: number, to: number | null = null): ItemSeries {
    const refreshedAt = this.state('refreshedAt');
    const pending = this.gaps().filter(gap => gap.until >= dayOf(from));
    return {
      days: this.rows.days(quality, from, to),
      complete: !pending.length,
      readBackTo: pending.length
        ? dayOf(Math.max(...pending.map(gap => gap.until)) + 1)
        : null,
      refreshedAt: refreshedAt === null ? null : new Date(refreshedAt),
    };
  }

  private async readGaps(): Promise<boolean> {
    const gaps = this.gaps().slice(0, CONCURRENCY);
    const reads = await Promise.allSettled(
      gaps.map(async gap => {
        const since = Math.max(gap.since, dayOf(gap.until - gap.window));
        const name = this.worlds.find(world => world.id === gap.world)?.name;
        const sales = name
          ? await this.readSales(name, {
              until: gap.until,
              within: gap.until - since,
              limit: this.chunk,
            })
          : [];
        return {gap, since, sales};
      }),
    );
    for (const read of reads) {
      if (read.status === 'fulfilled') this.keep(read.value);
    }
    const failed = reads.find(read => read.status === 'rejected');
    if (failed) throw failed.reason;
    return this.pending();
  }

  // Writes a read's whole days and moves its gap on.
  private keep({gap, since, sales}: {gap: Gap; since: number; sales: Sale[]}) {
    const lastDay = dayOf(gap.until);
    let firstDay = dayOf(since);
    // Once the window is read, what's left of the gap before it.
    let nextUntil: number | null = since > gap.since ? since - 1 : null;
    let kept = sales;
    if (sales.length >= this.chunk) {
      const times = sales.map(sale => sale.at);
      const oldest = dayOf(Math.min(...times));
      if (oldest === dayOf(Math.max(...times))) {
        // More sales in one day than a read holds: that day as read.
        firstDay = oldest;
        nextUntil = oldest - 1;
      } else {
        firstDay = oldest + DAY;
        nextUntil = oldest + DAY - 1;
        kept = sales.filter(sale => sale.at >= firstDay);
      }
    }
    this.storage.transactionSync(() => {
      this.rows.replace(
        gap.world,
        firstDay,
        lastDay,
        worldDays(gap.world, kept),
      );
      if (nextUntil === null || nextUntil < gap.since) {
        this.storage.sql.exec('DELETE FROM history_gaps WHERE id = ?', gap.id);
      } else {
        this.storage.sql.exec(
          'UPDATE history_gaps SET until = ?, span = ? WHERE id = ?',
          nextUntil,
          nextWindow(gap.window, sales.length, this.chunk),
          gap.id,
        );
      }
    });
  }

  private gaps(): Gap[] {
    return this.storage.sql
      .exec(
        'SELECT id, world, since, until, span FROM history_gaps ORDER BY until DESC, id',
      )
      .toArray()
      .map(row => ({
        id: Number(row.id),
        world: Number(row.world),
        since: Number(row.since),
        until: Number(row.until),
        window: Number(row.span),
      }));
  }

  // A gap on every world.
  private addGaps(since: number, until: number) {
    for (const world of this.worlds) {
      this.storage.sql.exec(
        'INSERT INTO history_gaps (world, since, until, span) VALUES (?, ?, ?, ?)',
        world.id,
        since,
        until,
        FIRST_WINDOW,
      );
    }
  }

  private state(key: string): number | null {
    const [row] = this.storage.sql
      .exec('SELECT value FROM history_state WHERE key = ?', key)
      .toArray();
    return row ? Number(row.value) : null;
  }

  private setState(key: string, value: number) {
    this.storage.sql.exec(
      'INSERT INTO history_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }
}

// The next window after a read of `count` sales: wider when it came back
// light, narrower when it filled up.
function nextWindow(window: number, count: number, chunk: number) {
  if (count >= chunk) return Math.max(MIN_WINDOW, window / 2);
  if (count < chunk / 4) return Math.min(MAX_WINDOW, window * 2);
  return window;
}

// What's left to read, and when (the days are MonthRows').
const TABLES = [
  // Windows of a world's sales still to read: those made in [since, until] (s).
  `CREATE TABLE IF NOT EXISTS history_gaps (
    id INTEGER PRIMARY KEY,
    world INTEGER NOT NULL,
    since INTEGER NOT NULL,
    until INTEGER NOT NULL,
    span INTEGER NOT NULL
  )`,
  // refreshedAt (ms): the newest sales' last read; readFrom (s): the oldest
  // day asked for so far.
  'CREATE TABLE IF NOT EXISTS history_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL)',
];

export {HISTORY_START, ItemHistory, ItemSeries, World};
