import {Sale} from './universalis';

const DAY = 86400;

// Which sales a day's figures count: all of them, or normal or high quality.
const QUALITIES = ['all', 'nq', 'hq'] as const;
type Quality = (typeof QUALITIES)[number];

// One day's sales of an item, for one quality.
interface DayStats {
  quality: Quality;
  // The day's start (UTC midnight, s since the epoch).
  day: number;
  // The middle price per unit: a few sales at silly prices (gil moved
  // between characters) don't sway it, as they would an average.
  median: number;
  min: number;
  max: number;
  sales: number;
  quantity: number;
}

// The start of the UTC day `at` (s) falls on.
function dayOf(at: number) {
  return Math.floor(at / DAY) * DAY;
}

// Each day's figures, per quality, from the sales made on it.
function dailyStats(sales: Sale[]): DayStats[] {
  const groups = new Map<
    string,
    {quality: Quality; day: number; sales: Sale[]}
  >();
  for (const sale of sales) {
    const day = dayOf(sale.at);
    for (const quality of ['all', sale.hq ? 'hq' : 'nq'] as const) {
      const key = `${quality}:${day}`;
      const group = groups.get(key) ?? {quality, day, sales: []};
      group.sales.push(sale);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(({quality, day, sales: daySales}) => {
    const prices = daySales.map(sale => sale.price).sort((a, b) => a - b);
    return {
      quality,
      day,
      median: median(prices),
      min: prices[0],
      max: prices[prices.length - 1],
      sales: daySales.length,
      quantity: daySales.reduce((sum, sale) => sum + sale.quantity, 0),
    };
  });
}

// The middle of sorted numbers, in whole gil.
function median(sorted: number[]) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export {DAY, DayStats, QUALITIES, Quality, dailyStats, dayOf};
