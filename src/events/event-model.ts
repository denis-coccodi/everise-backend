import {SHOWN_RATINGS} from './event';
import {DISTRICTS} from './event-places';

type AgeRating = (typeof SHOWN_RATINGS)[number];

// A community event as the Events page shows it: a party, a club night, a
// race or a gathering players run in game, with its start and end.
interface CommunityEvent {
  id: number;
  title: string;
  // The description's start, as plain text, for the card.
  summary: string;
  startsAt: string;
  endsAt: string;
  // Whether it's going on now.
  live: boolean;
  ageRating: AgeRating;
  dataCentre: string | null;
  world: string | null;
  // Where it is, in the organisers' words ("Goblet, Ward 13, Plot 43").
  location: string | null;
  tags: string[];
  // The banner picture's address on Partake.
  banner: string | null;
  recurring: boolean;
  // How many said they're going, on Partake.
  attendees: number;
  // Who runs it: a venue, a club, a Free Company.
  team: {
    name: string;
    icon: string | null;
    discord: string | null;
    website: string | null;
  } | null;
  // Its page on Partake.
  url: string;
}

// An event's own page: what its card shows, and the description as the
// organisers wrote it (Markdown).
interface EventDetail extends CommunityEvent {
  description: string;
}

// Where a venue is, as an event is matched to it: its world, its house
// (district, ward and plot; none for an apartment or a place elsewhere) and
// its Discord invite.
interface VenuePlace {
  world: string | null;
  house: House | null;
  discord: string | null;
}

interface EventList {
  // When the site last read Partake.
  fetchedAt: string;
  // The ones going on first, then by their start.
  events: CommunityEvent[];
}
interface House {
  district: District;
  ward: number;
  plot: number;
}
type District = keyof typeof DISTRICTS;

export {
  AgeRating,
  CommunityEvent,
  EventDetail,
  EventList,
  VenuePlace,
  House,
  District,
};
