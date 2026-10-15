import {VENUE_DATA_CENTRES, VenueDataCentre} from './venue-data-centres';
import {FfxivVenue, isShown, nextOpening, shownFields} from './venue';

// How one of a venue's openings comes back: every n weeks, or on one week
// of the month (1 for the first, -1 for the last) on its weekday.
type Repeat = {every: 'weeks'; weeks: number} | {every: 'month'; week: number};

// One of a venue's regular openings: its next one (the weekday and times
// the visitor sees come from it), and how it comes back.
interface ScheduledOpening {
  opensAt: string;
  closesAt: string;
  repeat: Repeat;
}

// A venue's own page: what its card shows, the data centre it's on, its
// next opening (null when it has none to come, e.g. closed for a while),
// and its regular openings, the next first.
interface VenueDetail extends ReturnType<typeof shownFields> {
  dataCentre: VenueDataCentre | null;
  nextOpening: {opensAt: string; closesAt: string; openNow: boolean} | null;
  schedule: ScheduledOpening[];
}

// The venue's page; undefined for one the site doesn't show (isShown).
function toVenueDetail(entry: FfxivVenue, now: Date): VenueDetail | undefined {
  if (!isShown(entry)) return undefined;
  const schedule = (entry.schedule ?? []).flatMap(item => {
    const opening = nextOpening(item.resolution, now);
    const repeat = repeatOf(item.interval);
    return opening && repeat
      ? [{opensAt: opening.opensAt, closesAt: opening.closesAt, repeat}]
      : [];
  });
  const dataCentre = entry.location?.dataCenter;
  return {
    ...shownFields(entry, now),
    dataCentre: VENUE_DATA_CENTRES.find(name => name === dataCentre) ?? null,
    nextOpening: nextOpening(entry.resolution, now) ?? null,
    schedule: schedule.sort((a, b) => a.opensAt.localeCompare(b.opensAt)),
  };
}

// FFXIV Venues' interval: type 0 is every n weeks, type 1 the nth (or, with
// -1, the last) of its weekday in the month. Anything else isn't shown.
function repeatOf(
  interval:
    {intervalType?: number; intervalArgument?: number} | null | undefined,
): Repeat | undefined {
  const n = interval?.intervalArgument;
  if (typeof n !== 'number' || !Number.isInteger(n)) return undefined;
  if (interval?.intervalType === 0 && n >= 1) return {every: 'weeks', weeks: n};
  if (interval?.intervalType === 1 && (n === -1 || (n >= 1 && n <= 5))) {
    return {every: 'month', week: n};
  }
  return undefined;
}

export {Repeat, ScheduledOpening, VenueDetail, toVenueDetail};
