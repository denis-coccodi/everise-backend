import {
  CatalogAction,
  TooltipChange,
  TraitChange,
  TraitEntry,
} from './catalog-model';

// An action at level 100, with what it was below each of its traits'
// levels: the game data's recast and charges are those before any trait.
function withTraits(
  action: CatalogAction,
  traits: TraitEntry[],
): CatalogAction {
  const mine = traits
    .filter(trait => trait.action === action.id)
    .sort((a, b) => a.level - b.level);
  // Recast and charges before each trait, lowest level first.
  let {recastMs, charges} = action;
  const before = mine.map(trait => {
    const values = {recastMs, charges};
    recastMs = trait.recastMs ?? recastMs;
    charges = trait.charges ?? charges;
    return values;
  });
  // Effects before each trait, undone from level 100 down.
  let effects = action.effects;
  const changes: TraitChange[] = [];
  for (let i = mine.length - 1; i >= 0; i--) {
    effects = mine[i].undo?.(effects) ?? effects;
    changes.push({
      trait: mine[i].trait,
      level: mine[i].level,
      ...before[i],
      effects,
    });
  }
  return {...action, recastMs, charges, traits: changes};
}

// What the patch check finds wrong with the traits: a trait whose row no
// longer has its name and level, or an action whose tooltip gives other
// charges than the catalog has at level 100.
function traitChanges(
  actions: CatalogAction[],
  traits: TraitEntry[],
  rows: Map<number, {name: string; level: number}>,
  tooltips: Map<number, string>,
): TooltipChange[] {
  const changes = new Map<number, TooltipChange>();
  const flag = (action: CatalogAction, missing: string) => {
    const change = changes.get(action.id) ?? {
      id: action.id,
      name: action.name,
      missing: [],
    };
    if (!change.missing.includes(missing)) change.missing.push(missing);
    changes.set(action.id, change);
  };
  const byId = new Map(actions.map(action => [action.id, action]));
  for (const trait of traits) {
    const action = byId.get(trait.action);
    const row = rows.get(trait.traitId);
    if (action && (row?.name !== trait.trait || row.level !== trait.level)) {
      flag(action, `trait ${trait.traitId} "${trait.trait}" at ${trait.level}`);
    }
  }
  for (const action of actions) {
    const shown = /Maximum Charges: (\d+)/.exec(tooltips.get(action.id) ?? '');
    if (shown && Number(shown[1]) !== action.charges) {
      flag(action, `${shown[1]} charges`);
    }
  }
  return [...changes.values()];
}

export {traitChanges, withTraits};
