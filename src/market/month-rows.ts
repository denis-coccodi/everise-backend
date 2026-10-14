import {SqlStorage} from '../db';
import {Figures, QUALITIES, Quality, WorldDay, dayOf} from './daily-stats';

// A day's figures as kept: [median, min, max, sales, quantity] for all
// sales, then normal and high quality (null when none of it sold).
type Packed = [number, number, number, number, number] | null;
type PackedDay = [Packed, Packed, Packed];

// A world's days, a row per month: every day of the month with sales, its
// figures inside the row (JSON, keyed by the day's start). The Free plan
// counts rows written and read, not their size, so a month in one row costs
// a thirtieth of a row a day, and nothing is lost.
class MonthRows {
  constructor(private readonly storage: SqlStorage) {
    this.storage.sql.exec(TABLE);
  }

  // Some day is kept (one row read).
  get hasDays() {
    return (
      this.storage.sql.exec('SELECT 1 FROM history_months LIMIT 1').toArray()
        .length > 0
    );
  }

  // The newest day kept on any world, or null.
  newestDay(): number | null {
    const rows = this.storage.sql
      .exec(
        'SELECT days FROM history_months WHERE month = (SELECT MAX(month) FROM history_months)',
      )
      .toArray();
    const days = rows.flatMap(row => Object.keys(parse(row.days)).map(Number));
    return days.length ? Math.max(...days) : null;
  }

  // Replaces a world's days from `firstDay` to `lastDay` (s) with `days`.
  replace(world: number, firstDay: number, lastDay: number, days: WorldDay[]) {
    for (
      let month = monthOf(firstDay);
      month <= lastDay;
      month = nextMonth(month)
    ) {
      const [row] = this.storage.sql
        .exec(
          'SELECT days FROM history_months WHERE month = ? AND world = ?',
          month,
          world,
        )
        .toArray();
      const kept = row ? parse(row.days) : {};
      for (const day of Object.keys(kept).map(Number)) {
        if (day >= firstDay && day <= lastDay) delete kept[day];
      }
      for (const day of days) {
        if (monthOf(day.day) === month) kept[day.day] = pack(day);
      }
      if (Object.keys(kept).length) {
        this.storage.sql.exec(
          'INSERT INTO history_months (month, world, days) VALUES (?, ?, ?) ON CONFLICT(month, world) DO UPDATE SET days = excluded.days',
          month,
          world,
          JSON.stringify(kept),
        );
      } else if (row) {
        this.storage.sql.exec(
          'DELETE FROM history_months WHERE month = ? AND world = ?',
          month,
          world,
        );
      }
    }
  }

  // `quality`'s days from `from` to `to` (s; null: to today) on each world,
  // the oldest first.
  days(quality: Quality, from: number, to: number | null = null) {
    const last = to === null ? Infinity : dayOf(to);
    const index = QUALITIES.indexOf(quality);
    return this.storage.sql
      .exec(
        'SELECT world, days FROM history_months WHERE month >= ? AND month <= ? ORDER BY month, world',
        monthOf(dayOf(from)),
        to === null ? Number.MAX_SAFE_INTEGER : monthOf(last),
      )
      .toArray()
      .flatMap(row =>
        Object.entries(parse(row.days)).flatMap(([day, packed]) => {
          const figures = unpack(packed[index]);
          return Number(day) >= dayOf(from) && Number(day) <= last && figures
            ? [{world: Number(row.world), day: Number(day), figures}]
            : [];
        }),
      )
      .sort((a, b) => a.day - b.day || a.world - b.world);
  }
}

// The start of the UTC month a day (s) falls in.
function monthOf(day: number) {
  const date = new Date(day * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
}

function nextMonth(month: number) {
  const date = new Date(month * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000;
}

function parse(json: unknown): Record<number, PackedDay> {
  return JSON.parse(String(json));
}

function pack({all, nq, hq}: WorldDay): PackedDay {
  const one = (f: Figures | null): Packed =>
    f ? [f.median, f.min, f.max, f.sales, f.quantity] : null;
  return [one(all), one(nq), one(hq)];
}

function unpack(packed: Packed): Figures | null {
  if (!packed) return null;
  const [median, min, max, sales, quantity] = packed;
  return {median, min, max, sales, quantity};
}

// Months first in the key: the page asks for days from a date. The first
// version of this object (migration v4) kept market_* tables under other
// object names; this is a new table, so the two never meet.
const TABLE = `CREATE TABLE IF NOT EXISTS history_months (
  month INTEGER NOT NULL,
  world INTEGER NOT NULL,
  days TEXT NOT NULL,
  PRIMARY KEY (month, world)
)`;

export {MonthRows};
