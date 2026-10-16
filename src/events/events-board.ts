import {
  CommunityEvent,
  EVENT_FIELDS,
  EventsFetch,
  GAME,
  PartakeEvent,
  partakeUrl,
  toEvent,
} from './event';

// Partake asks to be cached and not polled: the week's events are read at
// most this often, and only while someone is looking. The window starts on
// a multiple of it, so the Worker's instances ask for the same address and
// share the cached answer.
const REFRESH_MS = 5 * 60 * 1000;
// When Partake can't be reached, the last events stay this long.
const STALE_MS = 60 * 60 * 1000;
// After a failed read, it's asked again this soon rather than after a whole
// refresh.
const RETRY_MS = 30 * 1000;
// The page shows the events going on now and starting within this long.
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// More than a week of FFXIV events ever has (about 50 in October 2026).
const MAX_EVENTS = 200;

interface EventList {
  // When the site last read Partake.
  fetchedAt: string;
  // The ones going on first, then by their start.
  events: CommunityEvent[];
}

// The Final Fantasy XIV events on Partake (partake.gg), the community's
// calendar, for the coming week and kept between requests. Only the events
// rated at most MATURE are asked for, and only those are shown (isShown).
class EventsBoard {
  private snapshot?: {at: number; entries: PartakeEvent[]};
  private attemptedAt = -Infinity;
  private reading?: Promise<void>;

  constructor(
    private readonly fetchFn: EventsFetch,
    private readonly now: () => Date,
  ) {}

  // Null while Partake can't be reached.
  async events(): Promise<EventList | null> {
    if (this.now().getTime() - this.attemptedAt >= REFRESH_MS) {
      await this.refresh();
    } else {
      await this.reading;
    }
    if (!this.snapshot) return null;
    const now = this.now();
    return {
      fetchedAt: new Date(this.snapshot.at).toISOString(),
      events: this.snapshot.entries
        .map(entry => toEvent(entry, now))
        .filter(
          (event): event is CommunityEvent =>
            !!event && Date.parse(event.endsAt) > now.getTime(),
        )
        .sort(
          (a, b) =>
            Number(b.live) - Number(a.live) ||
            a.startsAt.localeCompare(b.startsAt) ||
            a.title.localeCompare(b.title),
        ),
    };
  }

  // One read at a time: requests arriving meanwhile wait.
  private refresh() {
    this.reading ??= this.readFrom().finally(() => {
      this.reading = undefined;
    });
    return this.reading;
  }

  private async readFrom() {
    const at = this.now().getTime();
    this.attemptedAt = at;
    const from = Math.floor(at / REFRESH_MS) * REFRESH_MS;
    try {
      const response = await this.fetchFn(partakeUrl(weekQuery(from)));
      if (!response.ok) throw new Error(`Partake answered ${response.status}`);
      const body = (await response.json()) as {
        data?: {events?: unknown} | null;
      } | null;
      const entries = body?.data?.events;
      if (!Array.isArray(entries)) throw new Error('Partake sent no events');
      this.snapshot = {
        at,
        entries: entries.filter(
          (entry): entry is PartakeEvent =>
            !!entry && typeof entry === 'object',
        ),
      };
    } catch (error) {
      console.error('Events: reading Partake failed', error);
      this.attemptedAt = at - REFRESH_MS + RETRY_MS;
      if (this.snapshot && at - this.snapshot.at > STALE_MS) {
        this.snapshot = undefined;
      }
    }
  }
}

// The events not over by `from` that start within the week after it.
function weekQuery(from: number) {
  const start = new Date(from).toISOString();
  const end = new Date(from + WINDOW_MS).toISOString();
  return `{ events(game: "${GAME}", ageRating: MATURE,
    endsBetween: {start: "${start}"}, startsBetween: {end: "${end}"},
    limit: ${MAX_EVENTS}, sortBy: STARTS_AT_ASC) { ${EVENT_FIELDS} } }`;
}

export {EventList, EventsBoard, REFRESH_MS, RETRY_MS, STALE_MS};
