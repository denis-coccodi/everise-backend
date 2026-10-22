import {UpstreamError} from '../errors';
import {Sale} from './universalis-dto';
import {SalesWindow} from './market-model';

// The minimal HTTP GET the reader needs; the Worker's global fetch fits it.
type UniversalisFetch = (
  url: string,
  init?: {headers?: Record<string, string>},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

// A world's sales (by its name) in a window.
type ReadSales = (world: string, window: SalesWindow) => Promise<Sale[]>;

const UNIVERSALIS_URL = 'https://universalis.app/api/v2/history';

// Universalis asks API users to say who they are.
const HEADERS = {'User-Agent': 'Everise (https://everise.dev)'};

// Reads an item's sales from Universalis (universalis.app), which players'
// uploads keep: its history goes back to late October 2022. One world at a
// time: Universalis answers a region or a data centre by merging all their
// worlds, which for a busy item often takes longer than the 5 seconds it
// allows (504), while a world answers in well under a second.
function universalisSales(
  fetchHistory: UniversalisFetch,
  itemId: number,
): ReadSales {
  return async (world, {until, within, limit}) => {
    const url =
      `${UNIVERSALIS_URL}/${encodeURIComponent(world)}/${itemId}` +
      `?entriesToReturn=${limit}&entriesUntil=${until}&entriesWithin=${within}`;
    const response = await fetchHistory(url, {headers: HEADERS}).catch(
      () => null,
    );
    // An item never sold there: Universalis knows nothing of it.
    if (response?.status === 404) return [];
    if (!response?.ok) {
      console.error(
        `Market: Universalis answered ${response?.status ?? 'nothing'} for ${url}`,
      );
      throw new UpstreamError(
        "The market board's history can't be read right now. Try again in a minute.",
      );
    }
    return toSales(await response.json());
  };
}

function toSales(body: unknown): Sale[] {
  const entries =
    body && typeof body === 'object' && 'entries' in body
      ? body.entries
      : undefined;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry: Record<string, unknown>) => {
    const at = Number(entry.timestamp);
    const price = Number(entry.pricePerUnit);
    const quantity = Number(entry.quantity);
    if (!(at > 0 && price >= 0 && quantity > 0)) return [];
    return [{at, price, quantity, hq: entry.hq === true}];
  });
}

export {ReadSales, UniversalisFetch, universalisSales};
