// The actions the planner schedules: how each is used (from the game data,
// read from XIVAPI) and what its heals and mitigations do (the effect
// tables next to this file, written by hand from the game's tooltips).

// Who an effect lands on: the user, the user or a chosen party member,
// the party around them, or the enemies (their damage dealt lowered).
const TARGETS = ['self', 'target', 'party', 'enemies'] as const;
type EffectTarget = (typeof TARGETS)[number];

const EFFECT_KINDS = [
  // Damage taken lowered (or enemies' damage dealt, for `enemies`).
  'mitigation',
  'shield',
  'heal',
  // Healing over time: `potency` a tick.
  'regen',
  // A heal that comes later: at a set HP, when the status ends, or as
  // `condition` says.
  'delayedHeal',
  'maxHp',
  'healingReceived',
  // The user's own healing raised.
  'healingPotency',
  // Attacks can't kill (Hallowed Ground, Holmgang, Living Dead...).
  'invulnerable',
] as const;
type EffectKind = (typeof EFFECT_KINDS)[number];

// What a shield's `percent` is of: the target's max HP, the user's max
// HP, or the HP the same action restored.
const SHIELD_BASES = ['maxHp', 'casterMaxHp', 'healed'] as const;
type ShieldBase = (typeof SHIELD_BASES)[number];

interface ActionEffect {
  kind: EffectKind;
  target: EffectTarget;
  // The status it puts on the target, as the game names it (and logs).
  status: string | null;
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

interface EffectValues {
  percent?: number;
  physical?: number;
  magic?: number;
  potency?: number;
  of?: ShieldBase;
  // The duration, in seconds as tooltips give it.
  s?: number;
  stacks?: number;
  condition?: string;
}

// An effect for the tables.
function effect(
  kind: EffectKind,
  target: EffectTarget,
  status: string | null,
  values: EffectValues = {},
): ActionEffect {
  return {
    kind,
    target,
    status,
    percent: values.percent ?? null,
    physical: values.physical ?? null,
    magic: values.magic ?? null,
    potency: values.potency ?? null,
    of: values.of ?? null,
    durationMs: values.s === undefined ? null : values.s * 1000,
    stacks: values.stacks ?? null,
    condition: values.condition ?? null,
  };
}

export {
  ActionEffect,
  CatalogAction,
  EFFECT_KINDS,
  EffectEntry,
  EffectKind,
  EffectTarget,
  SHIELD_BASES,
  TARGETS,
  effect,
};
