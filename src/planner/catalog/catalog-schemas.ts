import {z} from 'zod';
import {isoDate, responseSchema} from '../../api';
import {EFFECT_KINDS, SHIELD_BASES, TARGETS} from './action-catalog';

const int = z.number().int();

const ActionEffect = z.strictObject({
  kind: z.enum(EFFECT_KINDS),
  target: z.enum(TARGETS),
  // The status it puts on the target, as the game (and logs) name it.
  status: z.string().nullable(),
  // Its id in the game data, as logs give it.
  statusId: int.nullable(),
  percent: z.number().nullable(),
  physical: z.number().nullable(),
  magic: z.number().nullable(),
  potency: int.nullable(),
  // What a shield's `percent` is of.
  of: z.enum(SHIELD_BASES).nullable(),
  durationMs: int.nullable(),
  stacks: int.nullable(),
  // When it only sometimes applies, in words.
  condition: z.string().nullable(),
});

const CatalogAction = z.strictObject({
  id: int,
  name: z.string(),
  // The game's icon id.
  icon: int.nullable(),
  // Its tooltip, for the actions with effects.
  description: z.string().nullable(),
  jobs: z.array(z.string()),
  level: int,
  gcd: z.boolean(),
  castMs: int,
  recastMs: int,
  charges: int,
  // Actions with the same group share their recast timer.
  cooldownGroup: int,
  range: int,
  radius: int,
  // Its heals and mitigations; empty for the others.
  effects: z.array(ActionEffect),
  // What it was before each trait that changes it, highest level first:
  // below `level`, these values instead.
  traits: z.array(
    z.strictObject({
      trait: z.string(),
      level: int,
      recastMs: int,
      charges: int,
      effects: z.array(ActionEffect),
    }),
  ),
});

const TooltipChange = z.strictObject({
  id: int,
  name: z.string(),
  // Numbers of its effects the tooltip no longer has.
  missing: z.array(z.string()),
});

const ActionCatalogResponse = responseSchema(
  'ActionCatalogResponse',
  z.strictObject({
    dataVersion: z.string(),
    builtAt: isoDate,
    actions: z.array(CatalogAction),
    // Actions whose effects may be out of date after a patch.
    changed: z.array(TooltipChange),
  }),
);

const CatalogRefreshResponse = responseSchema(
  'CatalogRefreshResponse',
  z.strictObject({
    dataVersion: z.string(),
    actionCount: int,
    // Actions with heals or mitigations.
    effectCount: int,
    changed: z.array(TooltipChange),
  }),
);

export {ActionCatalogResponse, CatalogRefreshResponse};
