import {DataCentre} from '../party-finder';
import {FfxivVenue, Venue, toVenue} from './venue';

// How the board reaches FFXIV Venues; tests pass a fake.
type VenuesFetch = (
  url: string,
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

// The data centres FFXIV Venues lists venues on (it has none in Japan).
const VENUE_DATA_CENTRES = [
  'Light',
  'Chaos',
  'Aether',
  'Crystal',
  'Dynamis',
  'Primal',
  'Materia',
] as const satisfies readonly DataCentre[];
type VenueDataCentre = (typeof VENUE_DATA_CENTRES)[number];

// One data centre's venues opening within a week (about 200 KB).
const FFXIV_VENUES = 'https://api.ffxivvenues.com/v1/venue';
// Venues change their hours rarely: each data centre is read at most this
// often, and only while someone is looking.
const REFRESH_MS = 5 * 60 * 1000;
// When FFXIV Venues can't be reached, the last venues stay this long.
const STALE_MS = 60 * 60 * 1000;

interface VenueList {
  dataCentre: VenueDataCentre;
  // When the site last read FFXIV Venues.
  fetchedAt: string;
  // The ones open now first, then by their next opening.
  venues: Venue[];
}

// The venues of FFXIV Venues (ffxivvenues.com), the community's index of
// player-run venues, read a data centre at a time and kept between
// requests. Only the safe-for-work venues its team approved are shown.
class VenuesBoard {
  private readonly read = new Map<
    VenueDataCentre,
    {at: number; entries: FfxivVenue[]}
  >();
  private readonly attemptedAt = new Map<VenueDataCentre, number>();
  private readonly reading = new Map<VenueDataCentre, Promise<void>>();

  constructor(
    private readonly fetchFn: VenuesFetch,
    private readonly now: () => Date,
  ) {}

  // Null while FFXIV Venues can't be reached.
  async venues(dataCentre: VenueDataCentre): Promise<VenueList | null> {
    const attempted = this.attemptedAt.get(dataCentre) ?? -Infinity;
    if (this.now().getTime() - attempted >= REFRESH_MS) {
      await this.refresh(dataCentre);
    } else {
      await this.reading.get(dataCentre);
    }
    const snapshot = this.read.get(dataCentre);
    if (!snapshot) return null;
    const now = this.now();
    return {
      dataCentre,
      fetchedAt: new Date(snapshot.at).toISOString(),
      venues: snapshot.entries
        .map(entry => toVenue(entry, now))
        .filter((venue): venue is Venue => !!venue)
        .sort(
          (a, b) =>
            Number(b.openNow) - Number(a.openNow) ||
            a.opensAt.localeCompare(b.opensAt) ||
            a.name.localeCompare(b.name),
        ),
    };
  }

  // One read per data centre at a time: requests arriving meanwhile wait.
  private refresh(dataCentre: VenueDataCentre) {
    let reading = this.reading.get(dataCentre);
    if (!reading) {
      reading = this.readFrom(dataCentre).finally(() => {
        this.reading.delete(dataCentre);
      });
      this.reading.set(dataCentre, reading);
    }
    return reading;
  }

  private async readFrom(dataCentre: VenueDataCentre) {
    const at = this.now().getTime();
    this.attemptedAt.set(dataCentre, at);
    try {
      const response = await this.fetchFn(
        `${FFXIV_VENUES}?dataCenter=${dataCentre}&withinWeek=true`,
      );
      if (!response.ok) {
        throw new Error(`FFXIV Venues answered ${response.status}`);
      }
      const entries = await response.json();
      if (!Array.isArray(entries)) throw new Error('FFXIV Venues sent no list');
      this.read.set(dataCentre, {
        at,
        entries: entries.filter(
          (entry): entry is FfxivVenue => !!entry && typeof entry === 'object',
        ),
      });
    } catch (error) {
      console.error(`Venues: reading ${dataCentre} failed`, error);
      const last = this.read.get(dataCentre);
      if (last && at - last.at > STALE_MS) this.read.delete(dataCentre);
    }
  }
}

export {
  FFXIV_VENUES,
  REFRESH_MS,
  STALE_MS,
  VENUE_DATA_CENTRES,
  VenueDataCentre,
  VenueList,
  VenuesBoard,
  VenuesFetch,
};
