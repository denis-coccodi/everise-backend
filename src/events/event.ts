// How the app reaches Partake (partake.gg); tests pass a fake. Partake's
// GraphQL API answers GET requests too, so its answers can be cached.
type EventsFetch = (
  url: string,
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

const PARTAKE_API = 'https://api.partake.gg/';
const EVENT_PAGE = 'https://www.partake.gg/events/';
// Where an event's attachments (its banner first) are kept.
const PARTAKE_ASSETS = 'https://cdn.partake.gg/assets/';
const GAME = 'final-fantasy-xiv';

// The age ratings the site shows. Partake's ADULT events never are.
const SHOWN_RATINGS = ['EVERYONE', 'TEEN', 'MATURE'] as const;
type AgeRating = (typeof SHOWN_RATINGS)[number];

// How long the card's summary of the description is at most.
const MAX_SUMMARY = 200;

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

// Partake's event, as far as the site uses it. Fields may be missing or
// null, so every one is checked.
interface PartakeEvent {
  id?: number;
  title?: string | null;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  location?: string | null;
  locationData?: {
    dataCenter?: {name?: string | null} | null;
    server?: {name?: string | null} | null;
  } | null;
  ageRating?: string | null;
  tags?: (string | null)[] | null;
  attachments?: (string | null)[] | null;
  isRecurring?: boolean | null;
  attendeeCount?: number | null;
  game?: {id?: string | null} | null;
  team?: {
    name?: string | null;
    iconUrl?: string | null;
    discordUrl?: string | null;
    websiteUrl?: string | null;
  } | null;
}

// The fields every read asks Partake for.
const EVENT_FIELDS = `id title description startsAt endsAt location
  locationData { dataCenter { name } server { name } } ageRating tags
  attachments isRecurring attendeeCount game { id }
  team { name iconUrl discordUrl websiteUrl }`;

function partakeUrl(query: string) {
  return `${PARTAKE_API}?query=${encodeURIComponent(query)}`;
}

// Whether the site shows the event at all: a Final Fantasy XIV event with
// times, rated at most MATURE.
function isShown(entry: PartakeEvent): entry is PartakeEvent & {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string;
  ageRating: AgeRating;
} {
  return (
    Number.isInteger(entry.id) &&
    !!entry.title?.trim() &&
    entry.game?.id === GAME &&
    SHOWN_RATINGS.some(rating => rating === entry.ageRating) &&
    !Number.isNaN(Date.parse(entry.startsAt ?? '')) &&
    !Number.isNaN(Date.parse(entry.endsAt ?? ''))
  );
}

// The event as the page shows it; undefined for one it doesn't (isShown).
function toEvent(entry: PartakeEvent, now: Date): CommunityEvent | undefined {
  if (!isShown(entry)) return undefined;
  const startsAt = new Date(entry.startsAt);
  const endsAt = new Date(entry.endsAt);
  const team = entry.team;
  return {
    id: entry.id,
    title: entry.title.trim(),
    summary: summaryOf(entry.description ?? ''),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    live: startsAt <= now && now < endsAt,
    ageRating: entry.ageRating,
    dataCentre: entry.locationData?.dataCenter?.name || null,
    world: entry.locationData?.server?.name || null,
    location: entry.location?.trim() || null,
    tags: (entry.tags ?? []).filter((tag): tag is string => !!tag?.trim()),
    banner: assetUrl(entry.attachments?.[0]),
    recurring: entry.isRecurring === true,
    attendees: Math.max(0, Math.trunc(entry.attendeeCount ?? 0)),
    team: team?.name?.trim()
      ? {
          name: team.name.trim(),
          icon: httpsUrl(team.iconUrl),
          discord: httpsUrl(team.discordUrl),
          website: httpsUrl(team.websiteUrl),
        }
      : null,
    url: EVENT_PAGE + entry.id,
  };
}

function toEventDetail(
  entry: PartakeEvent,
  now: Date,
): EventDetail | undefined {
  const event = toEvent(entry, now);
  return event && {...event, description: entry.description?.trim() ?? ''};
}

// An attachment is the file's name on Partake's CDN (or, at times, its
// whole address).
function assetUrl(name: string | null | undefined) {
  if (!name) return null;
  if (/^[\w.-]+$/.test(name)) return PARTAKE_ASSETS + name;
  return httpsUrl(name);
}

function httpsUrl(value: string | null | undefined) {
  return value && /^https:\/\/\S+$/.test(value) ? value : null;
}

// The description's start without its Markdown: no pictures, links as
// their words, no headings or emphasis marks, on one line.
function summaryOf(markdown: string) {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= MAX_SUMMARY) return text;
  const cut = text.slice(0, MAX_SUMMARY - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > MAX_SUMMARY / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export {
  AgeRating,
  EVENT_FIELDS,
  CommunityEvent,
  EventDetail,
  EventsFetch,
  GAME,
  MAX_SUMMARY,
  PartakeEvent,
  SHOWN_RATINGS,
  partakeUrl,
  toEvent,
  toEventDetail,
};
