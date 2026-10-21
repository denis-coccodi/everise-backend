import {Db, Doc} from '../../db';
import {UnavailableError} from '../../errors';
import {JOBS} from '../fight-report';
import {CatalogAction} from './action-catalog';
import {EFFECTS, ENTRIES} from './effect-table';
import {TooltipChange, tooltipChanges} from './tooltip-check';
import {
  CatalogGet,
  readActions,
  readTooltips,
  toCatalogAction,
} from './xivapi-actions';

const CATALOGS = 'plannerCatalog';
const CATALOG_ID = 'catalog';

// The combat jobs the planner knows (PLD, WHM...).
const COMBAT_JOBS = new Set(Object.values(JOBS).map(job => job.job));

interface ActionCatalog {
  // XIVAPI's id for the game data the catalog was read from.
  dataVersion: string;
  builtAt: string;
  actions: CatalogAction[];
  // Actions whose tooltip no longer has a number of their effects.
  changed: TooltipChange[];
}

// The catalog kept as JSON text: a few hundred KB, sent as is.
interface CatalogDoc extends Doc {
  json: string;
}

// The actions the planner schedules: their use from the game data and
// their effects from the hand-written tables. Built when the game data is
// refreshed, kept in one document.
class CatalogService {
  constructor(
    private readonly db: Db,
    private readonly get: CatalogGet,
    private readonly now: () => Date,
  ) {}

  // Reads the game data again; a failed read leaves the kept catalog.
  async refresh() {
    const ids = [...EFFECTS.keys()];
    const [{version, rows}, tooltips] = await Promise.all([
      readActions(this.get, ids),
      readTooltips(this.get, ids),
    ]);
    const actions = rows
      .map(row =>
        toCatalogAction(row, COMBAT_JOBS, EFFECTS.get(row.row_id) ?? []),
      )
      .filter((action): action is CatalogAction => action !== null)
      .sort((a, b) => a.id - b.id);
    const names = new Map(actions.map(action => [action.id, action.name]));
    const changed = tooltipChanges(
      ENTRIES.map(entry => ({...entry, name: names.get(entry.id) ?? ''})),
      tooltips,
    );
    // Effects for actions the game data doesn't have any more.
    for (const id of ids) {
      if (!names.has(id)) changed.push({id, name: '', missing: ['the action']});
    }
    const catalog: ActionCatalog = {
      dataVersion: version,
      builtAt: this.now().toISOString(),
      actions,
      changed,
    };
    await this.db.set(CATALOGS, CATALOG_ID, {json: JSON.stringify(catalog)});
    return {
      dataVersion: version,
      actionCount: actions.length,
      effectCount: actions.filter(action => action.effects.length).length,
      changed,
    };
  }

  // The catalog as JSON text.
  async json() {
    const doc = await this.db.get<CatalogDoc>(CATALOGS, CATALOG_ID);
    if (!doc) {
      throw new UnavailableError(
        "The fight planner's action list isn't ready yet. Try again later.",
      );
    }
    return doc.json;
  }
}

export {ActionCatalog, CatalogService};
