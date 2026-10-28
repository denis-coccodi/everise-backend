import {creditMergedHots} from './fflogs-hots';
import {
  STATUS_OFFSET,
  numberOr,
  statusId,
  statusSpans,
} from './fflogs-statuses';
import {PullInput} from './fflogs-model';
import {FflogsEvent, FflogsPullData} from './fflogs-dto';
import {
  Cast,
  Named,
  PlayerStats,
  MpSample,
  PullTimeline,
  TimelinePlayer,
  DamageType,
} from './pull-timeline-model';

const STAT_FIELDS: Record<keyof PlayerStats, string> = {
  level: 'level',
  strength: 'strength',
  dexterity: 'dexterity',
  vitality: 'vitality',
  intelligence: 'intelligence',
  mind: 'mind',
  piety: 'piety',
  determination: 'determination',
  criticalHit: 'criticalHit',
  directHit: 'directHit',
  skillSpeed: 'skillSpeed',
  spellSpeed: 'spellSpeed',
  tenacity: 'tenacity',
};

// FFLogs' ability types for damage, checked against the game's AttackType
// and the logs' own multipliers on twelve Savage, Extreme and Ultimate kills
// (October 2026): 128 physical (the game's slashing and blunt), 1024 magic,
// 32 unique (gazes, a cleansed debuff's blast: no mitigation takes any of it
// off). Others (1: an attack as cast, before it lands) say nothing.
const DAMAGE_TYPES: Record<number, DamageType> = {
  128: 'physical',
  1024: 'magic',
  32: 'unique',
};

const num = (value: unknown) => numberOr(value, 0);
const orNull = (value: unknown) => numberOr(value, null);
const ofType = (events: FflogsEvent[], ...types: string[]) =>
  events.filter(event => types.includes(String(event.type)));
interface Resources {
  hitPoints?: unknown;
  maxHitPoints?: unknown;
  mp?: unknown;
  maxMP?: unknown;
}
const resources = (event: FflogsEvent) =>
  (event.targetResources ?? null) as Resources | null;

// The pull in the planner's model. FFLogs' "calculated" events (the
// amount as the attack left, before it lands) are left out for the
// landed ones.
function toTimeline(data: FflogsPullData, input: PullInput): PullTimeline {
  const durationMs = Math.max(data.endTime - data.startTime, 0);
  const at = (event: FflogsEvent) => num(event.timestamp) - data.startTime;
  const actors = new Map(data.actors.map(actor => [actor.id, actor]));
  const playerIds = new Set(input.players.map(player => player.id));
  // A pet's actions are its owner's; what isn't a player's is no one's.
  const ownerOf = (id: number | null) => {
    if (id === null) return null;
    const owner = actors.get(id)?.petOwner ?? id;
    return playerIds.has(owner) ? owner : null;
  };
  const petOf = (id: number | null) =>
    id !== null && actors.get(id)?.petOwner ? actors.get(id)!.name : null;
  const {events} = data;
  const abilityTypes = new Map(data.abilities.map(a => [a.gameID, a.type]));
  const damageType = (action: number) =>
    DAMAGE_TYPES[abilityTypes.get(action) ?? 0] ?? null;
  // Pets take hits and heals too; the planner follows the players.
  const onPlayer = (event: FflogsEvent) => playerIds.has(num(event.targetID));

  const damage = ofType(events.damage, 'damage')
    .filter(onPlayer)
    .map(event => ({
      at: at(event),
      target: num(event.targetID),
      source: num(event.sourceID),
      action: num(event.abilityGameID),
      damageType: damageType(num(event.abilityGameID)),
      amount: num(event.amount),
      unmitigated: orNull(event.unmitigatedAmount),
      mitigated: num(event.mitigated),
      absorbed: num(event.absorbed),
      overkill: num(event.overkill),
      multiplier: orNull(event.multiplier),
      tick: event.tick === true,
      statuses: String(event.buffs ?? '')
        .split('.')
        .filter(Boolean)
        .map(id => statusId(Number(id))),
      hp: orNull(resources(event)?.hitPoints),
    }));

  // FFLogs numbers a heal-over-time tick by its status.
  const heals = ofType(events.heals, 'heal')
    .filter(onPlayer)
    .map(event => {
      const id = num(event.abilityGameID);
      const fromStatus = id >= STATUS_OFFSET;
      return {
        at: at(event),
        source: ownerOf(orNull(event.sourceID)),
        pet: petOf(orNull(event.sourceID)),
        target: num(event.targetID),
        action: fromStatus ? null : id,
        status: fromStatus ? statusId(id) : null,
        amount: num(event.amount),
        overheal: num(event.overheal),
        tick: event.tick === true,
        estimated: false,
        hp: orNull(resources(event)?.hitPoints),
      };
    });

  const absorbs = ofType(events.heals, 'absorbed')
    .filter(onPlayer)
    .map(event => ({
      at: at(event),
      source: ownerOf(orNull(event.sourceID)),
      target: num(event.targetID),
      status: statusId(num(event.abilityGameID)),
      amount: num(event.amount),
      hitAction: orNull(event.extraAbilityGameID),
    }));

  const casts = (list: FflogsEvent[], owner: (id: number) => number) => {
    const out: Cast[] = [];
    // A cast bar's begincast comes first; its cast closes it.
    const casting = new Map<string, FflogsEvent>();
    for (const event of ofType(list, 'begincast', 'cast')) {
      const source = owner(num(event.sourceID));
      const key = `${source}:${event.abilityGameID}`;
      if (event.type === 'begincast') {
        casting.set(key, event);
        continue;
      }
      const begun = casting.get(key);
      casting.delete(key);
      out.push({
        at: begun ? at(begun) : at(event),
        source,
        target: orNull(event.targetID),
        action: num(event.abilityGameID),
        castMs: begun ? orNull(begun.duration) : null,
      });
    }
    return out;
  };

  const maxHp = new Map<number, number>();
  for (const event of [...events.damage, ...events.heals]) {
    const max = orNull(resources(event)?.maxHitPoints);
    const target = num(event.targetID);
    if (max !== null && max > (maxHp.get(target) ?? 0)) maxHp.set(target, max);
  }
  const mp = mpSeries(events, at);
  const combatants = new Map(
    ofType(events.combatants, 'combatantinfo').map(e => [num(e.sourceID), e]),
  );
  const players: TimelinePlayer[] = input.players.map(player => {
    const info = combatants.get(player.id);
    return {
      id: player.id,
      name: player.name,
      job: player.job,
      role: player.role,
      maxHp: maxHp.get(player.id) ?? null,
      maxMp: mp.get(player.id)?.max ?? null,
      mp: mp.get(player.id)?.samples ?? [],
      stats: info ? statsOf(info) : null,
    };
  });

  const enemyIds = new Set([
    ...damage.map(hit => hit.source),
    ...ofType(events.enemyCasts, 'cast', 'begincast').map(e => num(e.sourceID)),
  ]);
  const enemies = [...enemyIds]
    .sort((a, b) => a - b)
    .map(id => ({
      id,
      name: actors.get(id)?.name ?? (id === -1 ? 'Environment' : 'Unknown'),
      boss: actors.get(id)?.subType === 'Boss',
    }));

  const auras = statusSpans(
    [...events.buffs, ...events.debuffs, ...events.enemyDebuffs]
      .filter(event => actors.get(num(event.targetID))?.type !== 'Pet')
      .sort((a, b) => num(a.timestamp) - num(b.timestamp)),
    durationMs,
    at,
    id => ownerOf(id) ?? id,
  );

  const timeline: PullTimeline = {
    code: input.code,
    pullId: input.pullId,
    startedAt: input.startedAt,
    durationMs,
    players,
    enemies,
    actions: [],
    statuses: [],
    damage,
    heals: creditMergedHots(heals, auras),
    absorbs,
    playerCasts: casts(events.playerCasts, id => ownerOf(id) ?? id),
    enemyCasts: casts(events.enemyCasts, id => id),
    auras,
    deaths: ofType(events.deaths, 'death').map(event => ({
      at: at(event),
      player: num(event.targetID),
      action: orNull(event.killingAbilityGameID),
      source: orNull(event.killerID),
    })),
  };
  return {...timeline, ...names(timeline, data.abilities)};
}

function statsOf(info: FflogsEvent): PlayerStats {
  const stats = {} as PlayerStats;
  for (const [key, field] of Object.entries(STAT_FIELDS)) {
    stats[key as keyof PlayerStats] = num(info[field]);
  }
  return stats;
}

// The names of the actions and statuses the timeline refers to.
function names(
  timeline: PullTimeline,
  abilities: {gameID: number; name: string}[],
): {actions: Named[]; statuses: Named[]} {
  const byId = new Map(abilities.map(a => [a.gameID, a.name]));
  const actionIds = new Set([
    ...timeline.damage.map(e => e.action),
    ...timeline.heals.flatMap(e => (e.action === null ? [] : [e.action])),
    ...timeline.playerCasts.map(e => e.action),
    ...timeline.enemyCasts.map(e => e.action),
    ...timeline.absorbs.flatMap(e =>
      e.hitAction === null ? [] : [e.hitAction],
    ),
    ...timeline.deaths.flatMap(e => (e.action === null ? [] : [e.action])),
  ]);
  const statusIds = new Set([
    ...timeline.auras.map(e => e.status),
    ...timeline.absorbs.map(e => e.status),
    ...timeline.heals.flatMap(e => (e.status === null ? [] : [e.status])),
    ...timeline.damage.flatMap(e => e.statuses),
  ]);
  const named = (ids: Set<number>, offset: number) =>
    [...ids]
      .sort((a, b) => a - b)
      .map(id => ({id, name: byId.get(id + offset) ?? byId.get(id) ?? ''}));
  return {
    actions: named(actionIds, 0),
    statuses: named(statusIds, STATUS_OFFSET),
  };
}

// Each player's MP as the log reads it: as they cast (the caster's
// resources) and as they're hit or healed (the target's), only the readings
// where it changed, in time order; and their max MP.
function mpSeries(
  events: {
    playerCasts: FflogsEvent[];
    damage: FflogsEvent[];
    heals: FflogsEvent[];
  },
  at: (event: FflogsEvent) => number,
) {
  const readings: {player: number; at: number; mp: number; max: number}[] = [];
  const read = (event: FflogsEvent, player: unknown, res: unknown) => {
    const r = (res ?? null) as Resources | null;
    const value = orNull(r?.mp);
    if (value === null) return;
    readings.push({
      player: num(player),
      at: at(event),
      mp: value,
      max: num(r?.maxMP),
    });
  };
  for (const e of events.playerCasts) read(e, e.sourceID, e.sourceResources);
  for (const e of [...events.damage, ...events.heals]) {
    read(e, e.targetID, e.targetResources);
  }
  readings.sort((a, b) => a.at - b.at);
  const series = new Map<number, {max: number | null; samples: MpSample[]}>();
  for (const r of readings) {
    const own = series.get(r.player) ?? {max: null, samples: []};
    if (r.max > (own.max ?? 0)) own.max = r.max;
    if (own.samples.at(-1)?.mp !== r.mp) own.samples.push({at: r.at, mp: r.mp});
    series.set(r.player, own);
  }
  return series;
}

export {toTimeline};
