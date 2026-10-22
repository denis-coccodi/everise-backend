import {STATUS_IDS} from './status-ids';
import {
  ActionEffect,
  EffectKind,
  EffectTarget,
  ShieldBase,
} from './catalog-model';

// The actions the planner schedules: how each is used (from the game data,
// read from XIVAPI) and what its heals and mitigations do (the effect
// tables next to this file, written by hand from the game's tooltips).

// Who an effect lands on: the user, the user or a chosen party member,
// the party around them, or the enemies (their damage dealt lowered).
const TARGETS = ['self', 'target', 'party', 'enemies'] as const;

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

// What a shield's `percent` is of: the target's max HP, the user's max
// HP, or the HP the same action restored.
const SHIELD_BASES = ['maxHp', 'casterMaxHp', 'healed'] as const;

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
  // The status's id when its name isn't enough (Neutral Sect's barriers
  // and its buff share a name); otherwise it comes from STATUS_IDS.
  statusId?: number;
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
    statusId:
      values.statusId ??
      (status === null ? null : (STATUS_IDS[status] ?? null)),
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

export {EFFECT_KINDS, SHIELD_BASES, TARGETS, effect};
