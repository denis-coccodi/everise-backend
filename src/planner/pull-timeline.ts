import {Role} from './fight-report';

// One pull as the planner reads it: who was there, and everything that
// happened to and by them, in time order. Times (`at`, `from`, `to`) are ms
// from the pull's start. Never FFLogs' own shapes, so another source (e.g.
// local ACT logs) can fill the same model later.

// The game's ids: actions (skills, spells, the boss's attacks) and
// statuses (buffs, debuffs, shields) are numbered separately.
interface Named {
  id: number;
  name: string;
}

// A player's stats at the pull's start, as the log has them.
interface PlayerStats {
  level: number;
  strength: number;
  dexterity: number;
  vitality: number;
  intelligence: number;
  mind: number;
  piety: number;
  determination: number;
  criticalHit: number;
  directHit: number;
  skillSpeed: number;
  spellSpeed: number;
  tenacity: number;
}

interface TimelinePlayer {
  id: number;
  name: string;
  job: string | null;
  role: Role | null;
  // Null when the log never says (no hit or heal landed on them).
  maxHp: number | null;
  stats: PlayerStats | null;
}

// Whatever deals damage to the party: the boss, its adds, and the
// environment (id -1: floor puddles, falls).
interface TimelineEnemy extends Named {
  boss: boolean;
}

// Damage a player took.
interface Hit {
  at: number;
  target: number;
  // An enemy's id; -1 for the environment.
  source: number;
  action: number;
  // What the player lost, after mitigation and shields.
  amount: number;
  // Before anything reduced it; null when the log doesn't say.
  unmitigated: number | null;
  // Taken away by mitigation, and by shields.
  mitigated: number;
  absorbed: number;
  // What went past 0 HP.
  overkill: number;
  // The damage multiplier mitigation left (0.66: a third mitigated).
  multiplier: number | null;
  // A damage-over-time tick.
  tick: boolean;
  // The statuses on the player when it landed.
  statuses: number[];
  // The player's HP as the log has it at this hit.
  hp: number | null;
}

// Healing a player received. `source` is the healer (a pet's owner for
// its heals), or null for what the log credits to no player: merged
// heal-over-time ticks and the Limit Break.
interface Heal {
  at: number;
  source: number | null;
  // The pet that cast it (Eos, Seraph, Earthly Star...), if one did.
  pet: string | null;
  target: number;
  action: number;
  amount: number;
  overheal: number;
  tick: boolean;
  hp: number | null;
}

// Damage a shield took for a player.
interface Absorb {
  at: number;
  // Who put the shield up.
  source: number | null;
  target: number;
  status: number;
  amount: number;
  // The hit it absorbed.
  hitAction: number | null;
}

// An action used: by a player, or by an enemy (the boss's timeline).
interface Cast {
  at: number;
  source: number;
  target: number | null;
  action: number;
  // The cast bar's length, for actions with one; the action lands at
  // `at` + `castMs`.
  castMs: number | null;
}

// A status on someone (a player, or an enemy for debuffs such as
// Reprisal) from `from` to `to`.
interface StatusSpan {
  status: number;
  source: number | null;
  target: number;
  from: number;
  to: number;
  stacks: number | null;
  // A shield's size when it went up.
  shield: number | null;
}

interface Death {
  at: number;
  player: number;
  // What killed them, when the log says.
  action: number | null;
  source: number | null;
}

interface PullTimeline {
  code: string;
  pullId: number;
  startedAt: string;
  durationMs: number;
  players: TimelinePlayer[];
  enemies: TimelineEnemy[];
  actions: Named[];
  statuses: Named[];
  damage: Hit[];
  heals: Heal[];
  absorbs: Absorb[];
  playerCasts: Cast[];
  enemyCasts: Cast[];
  auras: StatusSpan[];
  deaths: Death[];
}

export {
  Absorb,
  Cast,
  Death,
  Heal,
  Hit,
  Named,
  PlayerStats,
  PullTimeline,
  StatusSpan,
  TimelineEnemy,
  TimelinePlayer,
};
