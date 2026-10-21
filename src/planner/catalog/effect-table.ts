import {ActionEffect} from './action-catalog';
import {AST_SGE_EFFECTS} from './ast-sge-effects';
import {DPS_EFFECTS} from './dps-effects';
import {TANK_EFFECTS} from './tank-effects';
import {WHM_SCH_EFFECTS} from './whm-sch-effects';

// Every action's hand-written effects, by action id.
const ENTRIES = [
  ...TANK_EFFECTS,
  ...WHM_SCH_EFFECTS,
  ...AST_SGE_EFFECTS,
  ...DPS_EFFECTS,
];

const EFFECTS = new Map<number, ActionEffect[]>(
  ENTRIES.map(entry => [entry.id, entry.effects]),
);

export {EFFECTS, ENTRIES};
