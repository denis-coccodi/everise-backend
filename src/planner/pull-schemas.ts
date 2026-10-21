import {z} from 'zod';
import {isoDate, responseSchema} from '../api';
import {ROLES} from './fight-report';
import {ReportParams} from './planner-schemas';

const PullParams = ReportParams.extend({
  pullId: z.coerce
    .number({error: "That isn't a pull of this report."})
    .int({error: "That isn't a pull of this report."})
    .min(1, {error: "That isn't a pull of this report."}),
});

const int = z.number().int();
// Times are ms from the pull's start.
const at = int;

const Named = z.strictObject({id: int, name: z.string()});

const PlayerStats = z.strictObject({
  level: int,
  strength: int,
  dexterity: int,
  vitality: int,
  intelligence: int,
  mind: int,
  piety: int,
  determination: int,
  criticalHit: int,
  directHit: int,
  skillSpeed: int,
  spellSpeed: int,
  tenacity: int,
});

const TimelinePlayer = z.strictObject({
  id: int,
  name: z.string(),
  job: z.string().nullable(),
  role: z.enum(ROLES).nullable(),
  maxHp: int.nullable(),
  stats: PlayerStats.nullable(),
});

const Hit = z.strictObject({
  at,
  target: int,
  // An enemy's id; -1 for the environment.
  source: int,
  action: int,
  // What the player lost, after mitigation and shields.
  amount: int,
  unmitigated: int.nullable(),
  mitigated: int,
  absorbed: int,
  overkill: int,
  multiplier: z.number().nullable(),
  tick: z.boolean(),
  // The statuses on the player when it landed.
  statuses: z.array(int),
  hp: int.nullable(),
});

const Heal = z.strictObject({
  at,
  // The healer (a pet's owner); null for merged heal-over-time ticks and
  // the Limit Break.
  source: int.nullable(),
  pet: z.string().nullable(),
  target: int,
  action: int,
  amount: int,
  overheal: int,
  tick: z.boolean(),
  hp: int.nullable(),
});

const Absorb = z.strictObject({
  at,
  source: int.nullable(),
  target: int,
  status: int,
  amount: int,
  hitAction: int.nullable(),
});

const Cast = z.strictObject({
  at,
  source: int,
  target: int.nullable(),
  action: int,
  // The cast bar's length; the action lands at `at` + `castMs`.
  castMs: int.nullable(),
});

const StatusSpan = z.strictObject({
  status: int,
  source: int.nullable(),
  target: int,
  from: at,
  to: at,
  stacks: int.nullable(),
  // A shield's size when it went up.
  shield: int.nullable(),
});

const PullTimelineResponse = responseSchema(
  'PullTimelineResponse',
  z.strictObject({
    code: z.string(),
    pullId: int,
    startedAt: isoDate,
    durationMs: int.min(0),
    players: z.array(TimelinePlayer),
    // The boss, its adds, and the environment (id -1).
    enemies: z.array(Named.extend({boss: z.boolean()})),
    // The names of the actions and statuses referred to below (the game's
    // ids).
    actions: z.array(Named),
    statuses: z.array(Named),
    // Damage the players took, from any source.
    damage: z.array(Hit),
    heals: z.array(Heal),
    // Damage shields took for the players.
    absorbs: z.array(Absorb),
    playerCasts: z.array(Cast),
    // The boss's timeline.
    enemyCasts: z.array(Cast),
    // Statuses on the players, and debuffs on enemies.
    auras: z.array(StatusSpan),
    deaths: z.array(
      z.strictObject({
        at,
        player: int,
        action: int.nullable(),
        source: int.nullable(),
      }),
    ),
  }),
);

export {PullParams, PullTimelineResponse};
