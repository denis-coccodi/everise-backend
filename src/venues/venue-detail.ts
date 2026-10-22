import {VENUE_DATA_CENTRES} from './venue-data-centres';
import {isShown, nextOpening, shownFields} from './venue';
import {FfxivVenue} from './ffxiv-venues-dto';
import {Repeat, VenueDetail} from './venue-model';

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

export {toVenueDetail};
