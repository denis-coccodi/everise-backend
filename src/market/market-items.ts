import {HttpGet} from '../duties';
import {UpstreamError} from '../errors';
import {MarketItem} from './market-model';

const XIVAPI_URL = 'https://v2.xivapi.com/api';

// Items found per search.
const MAX_RESULTS = 20;

const FIELDS = 'Name,Icon,CanBeHq,ItemSearchCategory.Name';

interface ItemRow {
  row_id: number;
  fields: Record<string, unknown>;
}

// The game's items, from XIVAPI: searched by name, or read by id. Only
// those the market board sells (with a market category) are answered.
class MarketItems {
  constructor(
    private readonly httpGet: HttpGet,
    private readonly baseUrl = XIVAPI_URL,
  ) {}

  async search(text: string): Promise<MarketItem[]> {
    // Quotes would end XIVAPI's string: the name is searched without them.
    const name = text.replace(/["\\]/g, ' ').trim();
    const query = `+Name~"${name}" +ItemSearchCategory>=1`;
    const body = await this.read(
      `${this.baseUrl}/search?sheets=Item&query=${encodeURIComponent(query)}` +
        `&fields=${FIELDS}&limit=${MAX_RESULTS}&language=en`,
    );
    return toItems(body, 'results');
  }

  // The items with these ids, in the order asked; ids of items the market
  // board doesn't sell are left out.
  async byIds(ids: number[]): Promise<MarketItem[]> {
    const body = await this.read(
      `${this.baseUrl}/sheet/Item?rows=${ids.join(',')}&fields=${FIELDS}&language=en`,
    );
    const items = new Map(toItems(body, 'rows').map(item => [item.id, item]));
    return ids.flatMap(id => items.get(id) ?? []);
  }

  private async read(url: string): Promise<unknown> {
    const response = await this.httpGet(url).catch(() => null);
    if (!response?.ok) {
      throw new UpstreamError(
        "The game's items can't be searched right now. Try again in a minute.",
      );
    }
    return response.json();
  }
}

function toItems(body: unknown, key: 'results' | 'rows'): MarketItem[] {
  const rows =
    body && typeof body === 'object' && key in body
      ? (body as Record<string, unknown>)[key]
      : undefined;
  if (!Array.isArray(rows)) return [];
  return (rows as ItemRow[]).flatMap(({row_id, fields}) => {
    const category = fields.ItemSearchCategory as
      {row_id?: number; fields?: {Name?: unknown}} | undefined;
    const icon = fields.Icon as {id?: unknown} | undefined;
    if (!category?.row_id || typeof fields.Name !== 'string') return [];
    return [
      {
        id: row_id,
        name: fields.Name,
        icon: Number(icon?.id) || 0,
        canBeHq: fields.CanBeHq === true,
        category: String(category.fields?.Name ?? ''),
      },
    ];
  });
}

export {MAX_RESULTS, MarketItems};
