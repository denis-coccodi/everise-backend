import {z} from 'zod';
import {responseSchema} from '../../api';
import {PULL_KINDS} from '../fight-report';

const ScriptMechanic = z.strictObject({
  // ms on the timeline's own clock (a typical group's).
  at: z.number().int(),
  name: z.string(),
  // The game's ability ids it's cast with, as logs have them.
  ids: z.array(z.number().int()),
  phase: z.string().nullable(),
  // The label it's under: a branch or variant; null on the main line.
  block: z.string().nullable(),
  enrage: z.boolean(),
});

const FightScriptResponse = responseSchema(
  'FightScriptResponse',
  z.strictObject({
    // Null when cactbot has no timeline for the fight yet.
    script: z
      .strictObject({
        zone: z.number().int(),
        title: z.string(),
        mechanics: z.array(ScriptMechanic),
        enrageIds: z.array(z.number().int()),
        ignoredIds: z.array(z.number().int()),
        source: z.strictObject({commit: z.string(), path: z.string()}),
      })
      .nullable(),
  }),
);

const ScriptsSyncResponse = responseSchema(
  'ScriptsSyncResponse',
  z.strictObject({
    // Another run was going on: nothing was done this time.
    busy: z.boolean(),
    // Cactbot's commit the copy follows; null before its first run.
    commit: z.string().nullable(),
    // Files still to read, and the zones whose scripts this run kept.
    pending: z.number().int(),
    kept: z.array(z.number().int()),
  }),
);

const ScriptsCheckResponse = responseSchema(
  'ScriptsCheckResponse',
  z.strictObject({
    scriptCount: z.number().int(),
    newestZone: z.number().int().nullable(),
    // Fights newer than the newest with a script: none for them yet.
    missing: z.array(
      z.strictObject({zone: z.number().int(), kind: z.enum(PULL_KINDS)}),
    ),
  }),
);

export {FightScriptResponse, ScriptsCheckResponse, ScriptsSyncResponse};
