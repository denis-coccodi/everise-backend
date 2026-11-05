import {CatalogGet, getJson} from './xivapi-actions';
import {CatalogTrait} from './catalog-model';
import {ActionRow} from './xivapi-dto';

const XIVAPI = 'https://v2.xivapi.com/api';
const FIELDS = ['Name', 'Level', 'Icon@as(raw)', 'ClassJobCategory.Name'].join(
  ',',
);
// Every trait a job learns (row 0 and the unused ones have no level).
const LEARNED = '+Level>0';
const ROWS_PER_READ = 100;

const num = (value: unknown) => (typeof value === 'number' ? value : 0);

// Every trait of the given jobs, with its tooltip, in id order.
async function readJobTraits(
  get: CatalogGet,
  jobs: Set<string>,
): Promise<CatalogTrait[]> {
  const rows: ActionRow[] = [];
  const first = `${XIVAPI}/search?sheets=Trait&query=${encodeURIComponent(LEARNED)}&fields=${FIELDS}&limit=500`;
  let url = first;
  for (let page = 0; page < 20 && url; page++) {
    const body = (await getJson(get, url)) as {
      results?: ActionRow[];
      next?: string;
    };
    rows.push(...(body.results ?? []));
    url = body.next ? `${first}&cursor=${body.next}` : '';
  }
  const traits = rows.flatMap(row => {
    const f = row.fields;
    const category = f.ClassJobCategory as {fields?: {Name?: unknown}} | null;
    const its = String(category?.fields?.Name ?? '')
      .split(' ')
      .filter(job => jobs.has(job));
    if (its.length === 0) return [];
    return [
      {
        id: row.row_id,
        name: String(f.Name ?? ''),
        level: num(f.Level),
        icon: num(f['Icon@as(raw)']) || null,
        jobs: its,
        description: null as string | null,
      },
    ];
  });
  const ids = traits.map(t => t.id);
  const descriptions = new Map<number, string>();
  for (let i = 0; i < ids.length; i += ROWS_PER_READ) {
    const body = (await getJson(
      get,
      `${XIVAPI}/sheet/TraitTransient?rows=${ids.slice(i, i + ROWS_PER_READ).join(',')}&fields=Description`,
    )) as {rows?: ActionRow[]};
    for (const row of body.rows ?? []) {
      descriptions.set(row.row_id, String(row.fields.Description ?? ''));
    }
  }
  return traits
    .map(t => ({...t, description: descriptions.get(t.id) || null}))
    .sort((a, b) => a.id - b.id);
}

export {readJobTraits};
