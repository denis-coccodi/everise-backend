import {Figures, WorldDay} from './market-model';
import {Sale} from './universalis-dto';

const DAY = 86400;

// Which sales a day's figures count: all of them, or normal or high quality.
const QUALITIES = ['all', 'nq', 'hq'] as const;

// The start of the UTC day `at` (s) falls on.
function dayOf(at: number) {
  return Math.floor(at / DAY) * DAY;
}

// A world's days, from the sales made on it.
function worldDays(world: number, sales: Sale[]): WorldDay[] {
  const days = new Map<number, Sale[]>();
  for (const sale of sales) {
    const day = dayOf(sale.at);
    const group = days.get(day);
    if (group) group.push(sale);
    else days.set(day, [sale]);
  }
  return [...days].map(([day, daySales]) => ({
    world,
    day,
    // A day's group always has a sale.
    all: figures(daySales) as Figures,
    nq: figures(daySales.filter(sale => !sale.hq)),
    hq: figures(daySales.filter(sale => sale.hq)),
  }));
}

function figures(sales: Sale[]): Figures | null {
  if (!sales.length) return null;
  const prices = sales.map(sale => sale.price).sort((a, b) => a - b);
  return {
    median: median(prices),
    min: prices[0],
    max: prices[prices.length - 1],
    sales: sales.length,
    quantity: sales.reduce((sum, sale) => sum + sale.quantity, 0),
  };
}

// The middle of sorted numbers, in whole gil.
function median(sorted: number[]) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export {DAY, QUALITIES, dayOf, worldDays};
