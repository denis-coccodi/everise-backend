import {UpstreamError} from '../errors';

// One sale on the market board, as Universalis recorded it.
interface Sale {
  // When it sold (s since the epoch).
  at: number;
  // Gil per unit.
  price: number;
  quantity: number;
  hq: boolean;
}

// A window of sales to read: those made in [until - within, until] (s),
// the newest first, at most `limit` of them.
interface SalesWindow {
  until: number;
  within: number;
  limit: number;
}

// The minimal HTTP GET the reader needs; the Worker's global fetch fits it.
type UniversalisFetch = (
  url: string,
  init?: {headers?: Record<string, string>},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

type ReadSales = (window: SalesWindow) => Promise<Sale[]>;

const UNIVERSALIS_URL = 'https://universalis.app/api/v2/history';

// Universalis asks API users to say who they are.
const HEADERS = {'User-Agent': 'Everise (https://everise.dev)'};

// Reads an item's sales from Universalis (universalis.app), which players'
// uploads keep: its history goes back to late October 2022. `scope` is a
// data centre's or a world's name.
function universalisSales(
  fetchHistory: UniversalisFetch,
  scope: string,
  itemId: number,
): ReadSales {
  return async ({until, within, limit}) => {
    const url =
      `${UNIVERSALIS_URL}/${encodeURIComponent(scope)}/${itemId}` +
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

export {ReadSales, Sale, SalesWindow, UniversalisFetch, universalisSales};
