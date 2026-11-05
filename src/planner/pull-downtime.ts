import {FflogsEvent} from './fflogs-dto';
import {Downtime} from './pull-timeline-model';

// An enemy acting this early was there from the pull's start.
const FROM_START_MS = 10_000;
// An enemy this long after its last act (a cast, a hit) is gone: killed,
// as the log has no change for that. Bosses auto-attack every few seconds.
const GONE_MS = 5_000;
// Shorter than this, it's one enemy handing over to the next.
const MIN_DOWNTIME_MS = 2_000;

const num = (value: unknown) => (typeof value === 'number' ? value : 0);

// When an enemy acted first and last, by its id.
interface Acts {
  first: number;
  last: number;
}

// When nothing could be targeted (an intermission, between phases), from
// FFLogs' targetability changes of the enemies, with when each acted
// (`acts`: its casts and hits): an enemy is there from its first act (from
// the start if that's early) unless its first change makes it targetable,
// and gone after its last act (it died) unless a later change says
// otherwise. Enemies with no change don't count: a fight whose boss never
// leaves has none, and so no downtime. Under 2 seconds isn't downtime.
// `at` gives an event's time in the pull.
function downtimeOf(
  events: FflogsEvent[],
  at: (event: FflogsEvent) => number,
  durationMs: number,
  acts: Map<number, Acts> = new Map(),
): Downtime[] {
  const logged = events
    .filter(e => e.type === 'targetabilityupdate')
    .map(e => ({at: at(e), enemy: num(e.targetID), targetable: !!e.targetable}))
    .sort((a, b) => a.at - b.at);
  if (!logged.length) return [];
  const changes = [...logged];
  const targetable = new Map<number, boolean>();
  for (const enemy of new Set(logged.map(c => c.enemy))) {
    const own = logged.filter(c => c.enemy === enemy);
    const [first, last] = [own[0], own[own.length - 1]];
    const act = acts.get(enemy);
    // Untargetable first: there before it, from its first act.
    const there = !first.targetable;
    const from = act && act.first > FROM_START_MS ? act.first : 0;
    targetable.set(enemy, there && from === 0);
    if (there && from > 0 && from < first.at) {
      changes.push({at: from, enemy, targetable: true});
    }
    // Still targetable after its last change: gone after its last act.
    const gone = act ? act.last + GONE_MS : null;
    if (
      last.targetable &&
      gone !== null &&
      gone > last.at &&
      gone < durationMs
    ) {
      changes.push({at: gone, enemy, targetable: false});
    }
  }
  changes.sort((a, b) => a.at - b.at);
  const out: Downtime[] = [];
  let since: number | null = null;
  const update = (moment: number) => {
    const none = ![...targetable.values()].some(Boolean);
    if (none && since === null) since = moment;
    if (!none && since !== null) {
      if (moment - since >= MIN_DOWNTIME_MS)
        out.push({from: since, to: moment});
      since = null;
    }
  };
  update(0);
  for (const change of changes) {
    targetable.set(change.enemy, change.targetable);
    update(Math.max(0, change.at));
  }
  if (since !== null && durationMs - since >= MIN_DOWNTIME_MS) {
    out.push({from: since, to: durationMs});
  }
  return out;
}

// When each enemy first and last acted: its casts, and its hits on the
// party, by its id.
function enemyActs(
  events: FflogsEvent[],
  at: (event: FflogsEvent) => number,
): Map<number, Acts> {
  const acts = new Map<number, Acts>();
  for (const event of events) {
    const id = num(event.sourceID);
    const t = at(event);
    const known = acts.get(id);
    acts.set(id, {
      first: Math.min(known?.first ?? t, t),
      last: Math.max(known?.last ?? t, t),
    });
  }
  return acts;
}

export {downtimeOf, enemyActs};
