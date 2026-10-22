import {EVENT_FIELDS, EventsFetch, partakeUrl, toEventDetail} from './event';
import {REFRESH_MS, STALE_MS} from './events-board';
import {EventDetail} from './event-model';
import {PartakeEvent} from './partake-dto';

// The events read one at a time are few: the ones people open or share.
// Past this many, the oldest read is dropped.
const MAX_KEPT = 200;

// Partake's events, one at a time, for an event's own page: each read at
// most every five minutes, and kept for an hour while Partake can't be
// reached. Only the events the site shows have a page (isShown), ended ones
// too, so a shared link still opens.
class EventPages {
  // An event as last read, or null for one Partake doesn't have.
  private readonly read = new Map<
    number,
    {at: number; entry: PartakeEvent | null}
  >();

  constructor(
    private readonly fetchFn: EventsFetch,
    private readonly now: () => Date,
  ) {}

  // Undefined for an event without a page here; null while Partake can't
  // be reached.
  async event(id: number): Promise<EventDetail | undefined | null> {
    const at = this.now().getTime();
    let kept = this.read.get(id);
    if (!kept || at - kept.at >= REFRESH_MS) {
      kept = (await this.readFrom(id, at)) ?? kept;
    }
    if (!kept || at - kept.at > STALE_MS) return null;
    return kept.entry ? toEventDetail(kept.entry, this.now()) : undefined;
  }

  // What Partake says now; undefined when it can't be reached.
  private async readFrom(id: number, at: number) {
    try {
      const response = await this.fetchFn(
        partakeUrl(`{ event(id: ${id}) { ${EVENT_FIELDS} } }`),
      );
      if (!response.ok) throw new Error(`Partake answered ${response.status}`);
      const body = (await response.json()) as {
        data?: {event?: unknown} | null;
        errors?: {extensions?: {code?: string}}[];
      } | null;
      const entry = body?.data?.event;
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        return this.keep(id, {at, entry: entry as PartakeEvent});
      }
      if (body?.errors?.some(error => error.extensions?.code === 'NotFound')) {
        return this.keep(id, {at, entry: null});
      }
      throw new Error('Partake sent no event');
    } catch (error) {
      console.error(`Events: reading event ${id} failed`, error);
      return undefined;
    }
  }

  private keep(id: number, kept: {at: number; entry: PartakeEvent | null}) {
    this.read.delete(id);
    this.read.set(id, kept);
    if (this.read.size > MAX_KEPT) {
      this.read.delete(this.read.keys().next().value as number);
    }
    return kept;
  }
}

export {EventPages};
