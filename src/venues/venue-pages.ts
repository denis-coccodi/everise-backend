import {VenueDetail, toVenueDetail} from './venue-detail';
import {FfxivVenue} from './venue';
import {FFXIV_VENUES, REFRESH_MS, STALE_MS, VenuesFetch} from './venues-board';

// The venues read one at a time are few: the ones people open or share.
// Past this many, the oldest read is dropped.
const MAX_KEPT = 200;

// FFXIV Venues' venues, one at a time, for a venue's own page: each read at
// most every five minutes, and kept for an hour while FFXIV Venues can't be
// reached. Only the venues the site shows have a page (isShown).
class VenuePages {
  // A venue as last read, or null for one FFXIV Venues doesn't have.
  private readonly read = new Map<
    string,
    {at: number; entry: FfxivVenue | null}
  >();

  constructor(
    private readonly fetchFn: VenuesFetch,
    private readonly now: () => Date,
  ) {}

  // Undefined for a venue without a page here; null while FFXIV Venues
  // can't be reached.
  async venue(id: string): Promise<VenueDetail | undefined | null> {
    const at = this.now().getTime();
    let kept = this.read.get(id);
    if (!kept || at - kept.at >= REFRESH_MS) {
      kept = (await this.readFrom(id, at)) ?? kept;
    }
    if (!kept || at - kept.at > STALE_MS) return null;
    return kept.entry ? toVenueDetail(kept.entry, this.now()) : undefined;
  }

  // What FFXIV Venues says now; undefined when it can't be reached.
  private async readFrom(id: string, at: number) {
    try {
      const response = await this.fetchFn(
        `${FFXIV_VENUES}/${encodeURIComponent(id)}`,
      );
      if (response.status === 404) return this.keep(id, {at, entry: null});
      if (!response.ok) {
        throw new Error(`FFXIV Venues answered ${response.status}`);
      }
      const entry = await response.json();
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('FFXIV Venues sent no venue');
      }
      return this.keep(id, {at, entry: entry as FfxivVenue});
    } catch (error) {
      console.error(`Venues: reading venue ${id} failed`, error);
      return undefined;
    }
  }

  private keep(id: string, kept: {at: number; entry: FfxivVenue | null}) {
    this.read.delete(id);
    this.read.set(id, kept);
    if (this.read.size > MAX_KEPT) {
      this.read.delete(this.read.keys().next().value as string);
    }
    return kept;
  }
}

export {VenuePages};
