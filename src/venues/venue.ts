// A player-run venue as the page shows it: a club, café, tavern or other
// place players open in their house, with its next opening.
interface Venue {
  id: string;
  name: string;
  // Its paragraphs, as the owners wrote them.
  description: string[];
  banner: string | null;
  world: string | null;
  // Where it is on its world, ready to show ("Goblet, Ward 25
  // (subdivision), Plot 48"), or the owners' own words for it.
  address: string | null;
  tags: string[];
  website: string | null;
  discord: string | null;
  // Its page on FFXIV Venues.
  url: string;
  // What the owners say right now ("Closed this week").
  notices: string[];
  // Its next opening (or the one going on).
  opensAt: string;
  closesAt: string;
  openNow: boolean;
}

// FFXIV Venues' venue, as far as the page uses it. Fields may be missing or
// null, so every one is checked.
interface FfxivVenue {
  id?: string;
  name?: string;
  description?: (string | null)[] | null;
  bannerUri?: string | null;
  location?: {
    world?: string | null;
    district?: string | null;
    ward?: number;
    plot?: number;
    apartment?: number;
    room?: number;
    subdivision?: boolean;
    override?: string | null;
  } | null;
  website?: string | null;
  discord?: string | null;
  sfw?: boolean;
  approved?: boolean;
  tags?: (string | null)[] | null;
  notices?: {start?: string; end?: string; message?: string}[] | null;
  resolution?: {start?: string; end?: string} | null;
}

const VENUE_PAGE = 'https://ffxivvenues.com/venue/';

// The venue as the page shows it; undefined for one it doesn't: not safe
// for work, not approved by FFXIV Venues' team, or with no opening to come.
function toVenue(entry: FfxivVenue, now: Date): Venue | undefined {
  const opensAt = Date.parse(entry.resolution?.start ?? '');
  const closesAt = Date.parse(entry.resolution?.end ?? '');
  const at = now.getTime();
  if (!entry.id || !entry.name || entry.sfw !== true || !entry.approved) {
    return undefined;
  }
  if (Number.isNaN(opensAt) || Number.isNaN(closesAt) || closesAt <= at) {
    return undefined;
  }
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

export {FfxivVenue, Venue, toVenue};
