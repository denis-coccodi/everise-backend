import {FfxivVenue} from './ffxiv-venues-dto';
import {Venue} from './venue-model';

const VENUE_PAGE = 'https://ffxivvenues.com/venue/';

// Whether the page shows the venue at all: safe for work and approved by
// FFXIV Venues' team.
function isShown(
  entry: FfxivVenue,
): entry is FfxivVenue & {id: string; name: string} {
  return !!entry.id && !!entry.name && entry.sfw === true && !!entry.approved;
}

// The venue as the page shows it; undefined for one it doesn't: not shown
// at all (isShown), or with no opening to come.
function toVenue(entry: FfxivVenue, now: Date): Venue | undefined {
  const opening = nextOpening(entry.resolution, now);
  if (!isShown(entry) || !opening) return undefined;
  return {...shownFields(entry, now), ...opening};
}

// What every view of a venue shows, but its openings.
function shownFields(
  entry: FfxivVenue & {id: string; name: string},
  now: Date,
) {
  const at = now.getTime();
  return {
    id: entry.id,
    name: entry.name,
    description: texts(entry.description),
    banner: entry.bannerUri || null,
    world: entry.location?.world || null,
    address: addressOf(entry.location),
    tags: texts(entry.tags),
    website: entry.website || null,
    discord: entry.discord || null,
    url: VENUE_PAGE + encodeURIComponent(entry.id),
    notices: (entry.notices ?? [])
      .filter(
        notice =>
          notice.message &&
          Date.parse(notice.start ?? '') <= at &&
          at < Date.parse(notice.end ?? ''),
      )
      .map(notice => notice.message as string),
  };
}

// An opening FFXIV Venues worked out (with the venue's offset), in UTC;
// undefined when there's none, or it has ended.
function nextOpening(
  resolution: {start?: string; end?: string} | null | undefined,
  now: Date,
) {
  const opensAt = Date.parse(resolution?.start ?? '');
  const closesAt = Date.parse(resolution?.end ?? '');
  const at = now.getTime();
  if (Number.isNaN(opensAt) || Number.isNaN(closesAt) || closesAt <= at) {
    return undefined;
  }
  return {
    opensAt: new Date(opensAt).toISOString(),
    closesAt: new Date(closesAt).toISOString(),
    openNow: opensAt <= at,
  };
}

function texts(values: (string | null)[] | null | undefined) {
  return (values ?? []).filter((value): value is string => !!value?.trim());
}

// "Mist, Ward 14 (subdivision), Plot 33", "…, Apartment 12" or
// "…, Plot 60, Room 10". A venue elsewhere (a tour, another place) says
// where in its own words.
function addressOf(location: FfxivVenue['location']) {
  if (!location) return null;
  if (location.override?.trim()) return location.override.trim();
  if (!location.ward) return location.district || null;
  const parts = [
    location.district,
    `Ward ${location.ward}${location.subdivision ? ' (subdivision)' : ''}`,
  ];
  if (location.apartment) {
    parts.push(`Apartment ${location.apartment}`);
  } else if (location.plot) {
    parts.push(`Plot ${location.plot}`);
    if (location.room) parts.push(`Room ${location.room}`);
  }
  return parts.filter(Boolean).join(', ');
}

export {isShown, nextOpening, shownFields, toVenue};
