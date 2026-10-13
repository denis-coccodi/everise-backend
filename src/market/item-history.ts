import {SqlStorage} from '../db';
import {DAY, DayStats, Quality, dailyStats, dayOf} from './daily-stats';
import {ReadSales} from './universalis';

// Sales read per call to Universalis (about 1.5 MB).
const CHUNK = 10_000;
// How long the newest days are taken as up to date.
const STALE_MS = 15 * 60 * 1000;
// Universalis' history starts in late October 2022: nothing older is asked.
const HISTORY_START = Date.UTC(2022, 9, 1) / 1000;
// The longest window one step reads: Universalis often fails (500, 504)
// windows of years for the busiest items.
const MAX_WINDOW = 180 * DAY;

// What the page draws for an item: its days so far, the oldest first.
interface ItemSeries {
  points: DayStats[];
  // Every sale Universalis keeps has been read (until then, the oldest days
  // are still coming in).
  complete: boolean;
  // When the newest sales were last read.
  refreshedAt: Date | null;
}

// One item's price history in one place (a data centre or a world), kept as
// each day's figures. Universalis answers a limited number of sales at a
// time, the newest first, so the history is read in steps, newest first:
// the windows still to read are its gaps. The first step reads the newest
// sales; later steps go back to the oldest sale Universalis keeps. Once
// what's kept is STALE_MS old, the days since the newest kept day are read
// again (a gap of their own, read before the older ones).
//
// A step reads at most MAX_WINDOW of a gap, starting on a day, and only
// whole days are written: when a step can't hold every sale of the window,
// its oldest day is read again, whole, by the next step.
class ItemHistory {
  // The step being read, if any.
  private running?: Promise<boolean>;

  constructor(
    private readonly storage: SqlStorage,
    private readonly readSales: ReadSales,
    private readonly now: () => Date,
    private readonly chunk = CHUNK,
  ) {
    for (const statement of TABLES) this.storage.sql.exec(statement);
  }

  // Adds what needs reading now: everything, the first time; the newest
  // days, once they're stale.
  plan() {
    const now = this.now().getTime();
    const refreshedAt = this.state('refreshedAt');
    if (refreshedAt === null) {
      this.addGap(HISTORY_START, Math.floor(now / 1000));
      this.setState('refreshedAt', now);
      return;
    }
    if (now - refreshedAt < STALE_MS) return;
    const newest = this.newestDay();
    // Nothing kept yet, or the newest days already waiting to be read.
    if (newest === null || this.gaps().some(gap => gap.until >= newest)) {
      return;
    }
    this.addGap(newest, Math.floor(now / 1000));
    this.setState('refreshedAt', now);
  }

  get pending() {
    return this.gaps().length > 0;
  }

  // Reads the newest gap's next sales; false once nothing is left to read.
  // A step asked for while one runs (a request during an alarm) shares it.
  step(): Promise<boolean> {
    this.running ??= this.readGap().finally(() => (this.running = undefined));
    return this.running;
  }

  private async readGap(): Promise<boolean> {
    const [gap] = this.gaps();
    if (!gap) return false;
    const since = Math.max(gap.since, dayOf(gap.until - MAX_WINDOW));
    const sales = await this.readSales({
      until: gap.until,
      within: gap.until - since,
      limit: this.chunk,
    });
    const lastDay = dayOf(gap.until);
    let firstDay = dayOf(since);
    // Once the window is read, what's left of the gap before it.
    let nextUntil: number | null = since > gap.since ? since - 1 : null;
    let kept = sales;
    if (sales.length >= this.chunk) {
      const times = sales.map(sale => sale.at);
      const oldest = dayOf(Math.min(...times));
      if (oldest === dayOf(Math.max(...times))) {
        // More sales in one day than a step holds: that day as read.
        firstDay = oldest;
        nextUntil = oldest - 1;
      } else {
        firstDay = oldest + DAY;
        nextUntil = oldest + DAY - 1;
        kept = sales.filter(sale => sale.at >= firstDay);
      }
    }
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        'DELETE FROM market_days WHERE day >= ? AND day <= ?',
        firstDay,
        lastDay,
      );
      for (const stats of dailyStats(kept)) this.writeDay(stats);
      if (nextUntil === null || nextUntil < gap.since) {
        this.storage.sql.exec('DELETE FROM market_gaps WHERE id = ?', gap.id);
      } else {
        this.storage.sql.exec(
          'UPDATE market_gaps SET until = ? WHERE id = ?',
          nextUntil,
          gap.id,
        );
      }
    });
    return this.pending;
  }

  series(quality: Quality): ItemSeries {
    const points = this.storage.sql
      .exec(
        'SELECT day, median, min, max, sales, quantity FROM market_days WHERE quality = ? ORDER BY day',
        quality,
      )
      .toArray()
      .map(row => ({
        quality,
        day: Number(row.day),
        median: Number(row.median),
        min: Number(row.min),
        max: Number(row.max),
        sales: Number(row.sales),
        quantity: Number(row.quantity),
      }));
    const refreshedAt = this.state('refreshedAt');
    return {
      points,
      complete: !this.pending,
      refreshedAt: refreshedAt === null ? null : new Date(refreshedAt),
    };
  }

  private gaps() {
    return this.storage.sql
      .exec('SELECT id, since, until FROM market_gaps ORDER BY until DESC')
      .toArray()
      .map(row => ({
        id: Number(row.id),
        since: Number(row.since),
        until: Number(row.until),
      }));
  }

  private addGap(since: number, until: number) {
    this.storage.sql.exec(
      'INSERT INTO market_gaps (since, until) VALUES (?, ?)',
      since,
      until,
    );
  }

  private newestDay(): number | null {
    const [row] = this.storage.sql
      .exec('SELECT MAX(day) AS day FROM market_days')
      .toArray();
    return row?.day === null || row?.day === undefined ? null : Number(row.day);
  }

  private writeDay(stats: DayStats) {
    this.storage.sql.exec(
      'INSERT INTO market_days (quality, day, median, min, max, sales, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)',
      stats.quality,
      stats.day,
      stats.median,
      stats.min,
      stats.max,
      stats.sales,
      stats.quantity,
    );
  }

  private state(key: string): number | null {
    const [row] = this.storage.sql
      .exec('SELECT value FROM market_state WHERE key = ?', key)
      .toArray();
    return row ? Number(row.value) : null;
  }

  private setState(key: string, value: number) {
    this.storage.sql.exec(
      'INSERT INTO market_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }
}

const TABLES = [
  `CREATE TABLE IF NOT EXISTS market_days (
    quality TEXT NOT NULL,
    day INTEGER NOT NULL,
    median INTEGER NOT NULL,
    min INTEGER NOT NULL,
    max INTEGER NOT NULL,
    sales INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    PRIMARY KEY (quality, day)
  )`,
  // Windows of sales still to read: those made in [since, until] (s).
  `CREATE TABLE IF NOT EXISTS market_gaps (
    id INTEGER PRIMARY KEY,
    since INTEGER NOT NULL,
    until INTEGER NOT NULL
  )`,
  'CREATE TABLE IF NOT EXISTS market_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL)',
];

export {ItemHistory, ItemSeries};
