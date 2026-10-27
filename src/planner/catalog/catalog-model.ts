import {EFFECT_KINDS, TARGETS, SHIELD_BASES} from './action-catalog';

interface ActionEffect {
  kind: EffectKind;
  target: EffectTarget;
  // The status it puts on the target, as the game names it (and logs),
  // and its id in the game data (and logs).
  status: string | null;
  statusId: number | null;
  // Mitigation of all damage, max HP, healing, or a shield (of `of`).
  percent: number | null;
  // Mitigation that differs for physical and magic damage.
  physical: number | null;
  magic: number | null;
  // A heal's, a regen tick's or a shield's potency.
  potency: number | null;
  of: ShieldBase | null;
  durationMs: number | null;
  // Barriers renewed or heals triggered this many times (Haima, Liturgy
  // of the Bell).
  stacks: number | null;
  // When it only sometimes applies, in words ("critical heal", "each
  // weaponskill").
  condition: string | null;
}

interface CatalogAction {
  id: number;
  name: string;
  // The action's icon (the game's icon id).
  icon: number | null;
  // Its tooltip, as the game writes it (lines split by "\n"); null when
  // the game data has none.
  description: string | null;
  // The jobs that have it (abbreviations); role actions list each job.
  jobs: string[];
  level: number;
  // On the global cooldown (a weaponskill or spell), or an oGCD ability.
  gcd: boolean;
  castMs: number;
  recastMs: number;
  charges: number;
  // Actions with the same group share their recast timer.
  cooldownGroup: number;
  // How far it reaches, and its area's radius (yalms).
  range: number;
  radius: number;
  effects: ActionEffect[];
}

// An effect of the hand-written tables, whose numbers the refresh checks
// against the action's tooltip.
interface EffectEntry {
  id: number;
  effects: ActionEffect[];
}

type EffectKind = (typeof EFFECT_KINDS)[number];

type EffectTarget = (typeof TARGETS)[number];

interface ActionCatalog {
  // XIVAPI's id for the game data the catalog was read from.
  dataVersion: string;
  builtAt: string;
  actions: CatalogAction[];
  // Actions whose tooltip no longer has a number of their effects.
  changed: TooltipChange[];
}

// An action whose tooltip no longer has a number its effects give, or one
// of whose status ids no longer has its name: a patch may have changed
// it, so the table needs a look.
interface TooltipChange {
  id: number;
  name: string;
  // The numbers looked for, as a tooltip writes them ("20%", "400", "15s"),
  // and the statuses that changed ('status 1191 "Rampart"').
  missing: string[];
}
type ShieldBase = (typeof SHIELD_BASES)[number];

export {
  ActionCatalog,
  ActionEffect,
  CatalogAction,
  EffectEntry,
  EffectKind,
  EffectTarget,
  TooltipChange,
  ShieldBase,
};
