import {UpstreamError} from '../../errors';
import {ActionEffect, CatalogAction} from './action-catalog';

const XIVAPI = 'https://v2.xivapi.com/api';

// The minimal HTTP GET the catalog needs; the Worker's global fetch fits.
type CatalogGet = (
  url: string,
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

interface ActionRow {
  row_id: number;
  fields: Record<string, unknown>;
}

const FIELDS = [
  'Name',
  'Icon@as(raw)',
  'ClassJobCategory.Name',
  'ClassJobLevel',
  'Cast100ms',
  'Recast100ms',
  'MaxCharges',
  'CooldownGroup',
  'AdditionalCooldownGroup',
  'Range',
  'EffectRange',
].join(',');

// Every action a player has, outside PvP.
const PLAYER_ACTIONS = '+IsPlayerAction=true -IsPvP=true +ClassJobLevel>0';
// The global cooldown's recast group.
const GCD_GROUP = 58;
// A sheet read 100 rows at a time.
const ROWS_PER_READ = 100;

async function getJson(get: CatalogGet, url: string) {
  const response = await get(url);
  if (!response.ok) {
    throw new UpstreamError(`XIVAPI answered ${response.status} for ${url}`);
  }
  return response.json();
}

// The players' actions, and the `extra` ones that replace another on the
// hotbar (Eukrasian Diagnosis, the Astrologian's cards...), which the game
// doesn't flag as player actions.
async function readActions(get: CatalogGet, extra: number[]) {
  const rows: ActionRow[] = [];
  let version = '';
  const first = `${XIVAPI}/search?sheets=Action&query=${encodeURIComponent(PLAYER_ACTIONS)}&fields=${FIELDS}&limit=500`;
  let url = first;
  for (let page = 0; page < 20 && url; page++) {
    const body = (await getJson(get, url)) as {
      version?: string;
      results?: ActionRow[];
      next?: string;
    };
    version = body.version ?? version;
    rows.push(...(body.results ?? []));
    // The next page needs the query again, or XIVAPI drops the fields.
    url = body.next ? `${first}&cursor=${body.next}` : '';
  }
  const found = new Set(rows.map(row => row.row_id));
  const missing = extra.filter(id => !found.has(id));
  for (let i = 0; i < missing.length; i += ROWS_PER_READ) {
    const ids = missing.slice(i, i + ROWS_PER_READ).join(',');
    const body = (await getJson(
      get,
      `${XIVAPI}/sheet/Action?rows=${ids}&fields=${FIELDS}`,
    )) as {version?: string; rows?: ActionRow[]};
    version ||= body.version ?? '';
    rows.push(...(body.rows ?? []));
  }
  return {version, rows};
}

// One text field of a sheet's rows, by row id.
async function readField(
  get: CatalogGet,
  sheet: string,
  field: string,
  ids: number[],
) {
  const values = new Map<number, string>();
  for (let i = 0; i < ids.length; i += ROWS_PER_READ) {
    const rows = ids.slice(i, i + ROWS_PER_READ).join(',');
    const body = (await getJson(
      get,
      `${XIVAPI}/sheet/${sheet}?rows=${rows}&fields=${field}`,
    )) as {rows?: ActionRow[]};
    for (const row of body.rows ?? []) {
      values.set(row.row_id, String(row.fields[field] ?? ''));
    }
  }
  return values;
}

// The actions' tooltips (ActionTransient), by action id.
const readTooltips = (get: CatalogGet, ids: number[]) =>
  readField(get, 'ActionTransient', 'Description', ids);

// The statuses' names, by status id.
const readStatusNames = (get: CatalogGet, ids: number[]) =>
  readField(get, 'Status', 'Name', ids);

const num = (value: unknown) => (typeof value === 'number' ? value : 0);

// An action of the given jobs; null for one none of them has (crafters,
// gatherers, limited jobs).
function toCatalogAction(
  row: ActionRow,
  jobs: Set<string>,
  effects: ActionEffect[],
): CatalogAction | null {
  const f = row.fields;
  const category = f.ClassJobCategory as {fields?: {Name?: unknown}} | null;
  const its = String(category?.fields?.Name ?? '')
    .split(' ')
    .filter(job => jobs.has(job));
  if (its.length === 0) return null;
  const icon = num(f['Icon@as(raw)']);
  return {
    id: row.row_id,
    name: String(f.Name ?? ''),
    icon: icon || null,
    jobs: its,
    level: num(f.ClassJobLevel),
    gcd:
      f.CooldownGroup === GCD_GROUP || f.AdditionalCooldownGroup === GCD_GROUP,
    castMs: num(f.Cast100ms) * 100,
    recastMs: num(f.Recast100ms) * 100,
    charges: Math.max(num(f.MaxCharges), 1),
    cooldownGroup: num(f.CooldownGroup),
    range: num(f.Range),
    radius: num(f.EffectRange),
    effects,
  };
}

export {
  ActionRow,
  CatalogGet,
  readActions,
  readStatusNames,
  readTooltips,
  toCatalogAction,
};
