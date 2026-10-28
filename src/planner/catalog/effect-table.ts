import {AST_SGE_EFFECTS} from './ast-sge-effects';
import {DPS_EFFECTS} from './dps-effects';
import {MP_EFFECTS} from './mp-effects';
import {TANK_EFFECTS} from './tank-effects';
import {WHM_SCH_EFFECTS} from './whm-sch-effects';
import {ActionEffect, EffectEntry} from './catalog-model';

// Every action's hand-written effects, one entry an action. The MP table's
// effects join the action's entry from the other tables (Assize's heal and
// its MP), or make one of their own.
const ENTRIES: EffectEntry[] = [
  ...TANK_EFFECTS,
  ...WHM_SCH_EFFECTS,
  ...AST_SGE_EFFECTS,
  ...DPS_EFFECTS,
].map(entry => {
  const mp = MP_EFFECTS.find(m => m.id === entry.id);
  return mp
    ? {id: entry.id, effects: [...entry.effects, ...mp.effects]}
    : entry;
});
for (const mp of MP_EFFECTS) {
  if (!ENTRIES.some(entry => entry.id === mp.id)) ENTRIES.push(mp);
}

const EFFECTS = new Map<number, ActionEffect[]>(
  ENTRIES.map(entry => [entry.id, entry.effects]),
);

export {EFFECTS, ENTRIES};
