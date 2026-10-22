import {VENUE_DATA_CENTRES} from './venue-data-centres';
import {shownFields} from './venue';

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

type VenueDataCentre = (typeof VENUE_DATA_CENTRES)[number];

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

interface VenueList {
  dataCentre: VenueDataCentre;
  // When the site last read FFXIV Venues.
  fetchedAt: string;
  // The ones open now first, then by their next opening.
  venues: Venue[];
}

export {
  Repeat,
  ScheduledOpening,
  Venue,
  VenueDataCentre,
  VenueDetail,
  VenueList,
};
