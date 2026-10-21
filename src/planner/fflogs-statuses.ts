import {FflogsEvent} from './fflogs-pull-query';
import {StatusSpan} from './pull-timeline';

// FFLogs numbers a status as 1,000,000 plus the game's status id.
const STATUS_OFFSET = 1_000_000;

const statusId = (gameId: number) =>
  gameId >= STATUS_OFFSET ? gameId - STATUS_OFFSET : gameId;

// A span still going: everything but its end.
type Open = Omit<StatusSpan, 'to'>;

// Each status's spans, from FFLogs' apply, refresh, stack and remove
// events. A status removed (or refreshed) without having been applied
// was there before the pull, so it starts at 0; one never removed lasts
// to the pull's end. A stack change ends a span and starts the next.
// `at` turns an event into ms from the pull's start; `ownerOf` credits a
// pet's statuses to its owner.
function statusSpans(
  events: FflogsEvent[],
  durationMs: number,
  at: (event: FflogsEvent) => number,
  ownerOf: (id: number | null) => number | null,
): StatusSpan[] {
  const spans: StatusSpan[] = [];
  const open = new Map<string, Open>();

  const close = (id: string, to: number) => {
    const span = open.get(id);
    if (!span) return;
    open.delete(id);
    spans.push({...span, to});
  };

  for (const event of events) {
    const type = String(event.type);
    const status = statusId(Number(event.abilityGameID));
    const source = ownerOf(numberOr(event.sourceID, null));
    const target = Number(event.targetID);
    const id = `${status}:${source}:${target}`;
    const time = Math.min(Math.max(at(event), 0), durationMs);
    const start = (stacks: number | null, shield: number | null, from = time) =>
      open.set(id, {status, source, target, from, stacks, shield});

    if (type === 'applybuff' || type === 'applydebuff') {
      close(id, time);
      start(numberOr(event.stack, null), numberOr(event.absorb, null));
    } else if (type === 'refreshbuff' || type === 'refreshdebuff') {
      if (!open.has(id)) start(null, null, 0);
    } else if (/^(apply|remove)(de)?buffstack$/.test(type)) {
      if (!open.has(id)) start(null, null, 0);
      const shield = open.get(id)?.shield ?? null;
      close(id, time);
      start(numberOr(event.stack, null), shield);
    } else if (type === 'removebuff' || type === 'removedebuff') {
      if (!open.has(id)) start(null, null, 0);
      close(id, time);
    }
  }
  for (const id of [...open.keys()]) close(id, durationMs);
  return spans.sort((a, b) => a.from - b.from || a.to - b.to);
}

function numberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === 'number' ? value : fallback;
}

export {STATUS_OFFSET, numberOr, statusId, statusSpans};
