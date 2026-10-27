import {Db, Doc} from '../../db';
import {UnavailableError} from '../../errors';
import {JOBS} from '../fight-report';
import {EFFECTS, ENTRIES} from './effect-table';
import {tooltipChanges} from './tooltip-check';
import {
  CatalogGet,
  readActions,
  readStatusNames,
  readTooltips,
  toCatalogAction,
} from './xivapi-actions';
import {CatalogAction} from './catalog-model';
import {ActionCatalog} from './catalog-model';

const CATALOGS = 'plannerCatalog';
const CATALOG_ID = 'catalog';

// The combat jobs the planner knows (PLD, WHM...).
const COMBAT_JOBS = new Set(Object.values(JOBS).map(job => job.job));

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
    const statusIds = [
      ...new Set(
        ENTRIES.flatMap(entry => entry.effects.map(e => e.statusId)).filter(
          (id): id is number => id !== null,
        ),
      ),
    ];
    const [{version, rows}, statusNames] = await Promise.all([
      readActions(this.get, ids),
      readStatusNames(this.get, statusIds),
    ]);
    const jobActions = rows
      .map(row =>
        toCatalogAction(row, COMBAT_JOBS, EFFECTS.get(row.row_id) ?? []),
      )
      .filter((action): action is CatalogAction => action !== null);
    // Every action's tooltip, for the plan's tables (a damage GCD's too).
    const tooltips = await readTooltips(
      this.get,
      jobActions.map(action => action.id),
    );
    const actions = jobActions
      .map(action => ({
        ...action,
        description: tooltips.get(action.id) || null,
      }))
      .sort((a, b) => a.id - b.id);
    const names = new Map(actions.map(action => [action.id, action.name]));
    const changed = tooltipChanges(
      ENTRIES.map(entry => ({...entry, name: names.get(entry.id) ?? ''})),
      tooltips,
      statusNames,
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

export {CatalogService};
