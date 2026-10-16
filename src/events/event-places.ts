import {CommunityEvent} from './event';
import {EventsBoard} from './events-board';

// Where a venue is, as an event is matched to it: its world, its house
// (district, ward and plot; none for an apartment or a place elsewhere) and
// its Discord invite.
interface VenuePlace {
  world: string | null;
  house: House | null;
  discord: string | null;
}

interface House {
  district: District;
  ward: number;
  plot: number;
}

// The housing districts, with the names and short forms organisers write.
const DISTRICTS = {
  mist: /\bmist\b/i,
  lavenderBeds: /\b(?:lavender(?:\s+beds)?|lav\.?\s*beds|lb)\b/i,
  goblet: /\bgoblet\b/i,
  shirogane: /\bshiro(?:gane)?\b/i,
  empyreum: /\bempy(?:reum)?\b/i,
};
type District = keyof typeof DISTRICTS;

const WARD = /\b(?:w|ward)\.?\s*(\d{1,2})\b/gi;
const PLOT = /\b(?:p|plot)\.?\s*(\d{1,2})\b/gi;
const MAX_WARD = 30;
const MAX_PLOT = 60;

// The house an event's location names ("Goblet > w13 > p43", "LB W7-P6",
// "Mist - Ward 21 - Plot 45"); undefined unless it names exactly one
// district, one ward and one plot, so a guess never links an event.
function houseIn(text: string): House | undefined {
  const districts = (Object.keys(DISTRICTS) as District[]).filter(name =>
    DISTRICTS[name].test(text),
  );
  const ward = onlyNumber(text, WARD, MAX_WARD);
  const plot = onlyNumber(text, PLOT, MAX_PLOT);
  if (districts.length !== 1 || !ward || !plot) return undefined;
  return {district: districts[0], ward, plot};
}

function onlyNumber(text: string, pattern: RegExp, max: number) {
  const numbers = new Set(
    [...text.matchAll(pattern)].map(match => Number(match[1])),
  );
  const [only] = numbers;
  return numbers.size === 1 && only >= 1 && only <= max ? only : undefined;
}

// A venue's district as FFXIV Venues names it ("Lavender Beds").
function districtOf(name: string | null | undefined): District | undefined {
  if (!name) return undefined;
  const districts = (Object.keys(DISTRICTS) as District[]).filter(district =>
    DISTRICTS[district].test(name),
  );
  return districts.length === 1 ? districts[0] : undefined;
}

// The invite's code ("discord.gg/abc", "discord.com/invite/abc"),
// lowercased: vanity invites are written in any case.
function inviteCode(url: string | null | undefined) {
  const match =
    /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)\/?$/i.exec(
      url?.trim() ?? '',
    );
  return match?.[1].toLowerCase();
}

// Whether the event is surely at the venue: on its world, and either at
// its house or run by the team whose Discord the venue gives.
function isAt(event: CommunityEvent, place: VenuePlace) {
  if (!place.world || event.world?.toLowerCase() !== place.world.toLowerCase())
    return false;
  const house = event.location ? houseIn(event.location) : undefined;
  if (
    house &&
    place.house &&
    house.district === place.house.district &&
    house.ward === place.house.ward &&
    house.plot === place.house.plot
  ) {
    return true;
  }
  const invite = inviteCode(place.discord);
  return !!invite && invite === inviteCode(event.team?.discord);
}

// The week's events at a venue, for its page ("Upcoming events here").
class EventsAtVenues {
  constructor(private readonly board: EventsBoard) {}

  // None while Partake can't be reached: the venue's page still shows.
  async at(place: VenuePlace): Promise<CommunityEvent[]> {
    const list = await this.board.events();
    return (list?.events ?? []).filter(event => isAt(event, place));
  }
}

export {EventsAtVenues, VenuePlace, districtOf, houseIn, inviteCode};
