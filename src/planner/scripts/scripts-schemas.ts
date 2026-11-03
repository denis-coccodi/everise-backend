import {z} from 'zod';
import {requestSchema, responseSchema} from '../../api';
import {PULL_KINDS} from '../fight-report';

// The longest timeline file taken (the largest today is 43,000 characters),
// within the API's 100 KB request bodies.
const MAX_TIMELINE_LENGTH = 90_000;

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

const NewScript = requestSchema(
  'NewScript',
  z.object({
    // Cactbot's commit the file was read at, and its path there.
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/, {error: 'Give the full 40-character commit.'}),
    path: z.string().min(1).max(200),
    // The game zone (TerritoryType id) the file is for.
    zone: z.number().int().positive(),
    text: z
      .string()
      .min(1)
      .max(MAX_TIMELINE_LENGTH, {
        error: `Keep a timeline to ${MAX_TIMELINE_LENGTH} characters.`,
      }),
  }),
);

const ScriptStoredResponse = responseSchema(
  'ScriptStoredResponse',
  z.strictObject({
    zone: z.number().int(),
    title: z.string(),
    mechanicCount: z.number().int(),
    enrageCount: z.number().int(),
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

export {
  FightScriptResponse,
  MAX_TIMELINE_LENGTH,
  NewScript,
  ScriptStoredResponse,
  ScriptsCheckResponse,
};
