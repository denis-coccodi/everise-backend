import {z} from 'zod';
import {isoDate, responseSchema} from '../api';
import {SHOWN_RATINGS} from './event';

// The largest id Partake's API takes (a GraphQL Int).
const MAX_EVENT_ID = 2_147_483_647;

const communityEvent = {
  id: z.number().int(),
  title: z.string(),
  // The description's start, as plain text, for the card.
  summary: z.string(),
  startsAt: isoDate,
  endsAt: isoDate,
  // Whether it's going on now.
  live: z.boolean(),
  // Partake's rating: the page labels MATURE events. ADULT ones never come.
  ageRating: z.enum(SHOWN_RATINGS),
  dataCentre: z.string().nullable(),
  world: z.string().nullable(),
  // Where it is, in the organisers' words ("Goblet, Ward 13, Plot 43").
  location: z.string().nullable(),
  // What it is, as Partake tags it ("Bars & Lounges", "Live DJs", ...).
  tags: z.array(z.string()),
  // The banner picture's address on Partake.
  banner: z.string().nullable(),
  recurring: z.boolean(),
  // How many said they're going, on Partake.
  attendees: z.number().int().min(0),
  // Who runs it: a venue, a club, a Free Company.
  team: z
    .strictObject({
      name: z.string(),
      icon: z.string().nullable(),
      // An invite to its Discord server.
      discord: z.string().nullable(),
      website: z.string().nullable(),
    })
    .nullable(),
  // Its page on Partake.
  url: z.string(),
};

const EventsResponse = responseSchema(
  'EventsResponse',
  z.strictObject({
    // When the site last read Partake.
    fetchedAt: isoDate,
    // The coming week's: the ones going on first, then by their start.
    events: z.array(z.strictObject(communityEvent)),
  }),
);

const EventPageResponse = responseSchema(
  'EventPageResponse',
  z.strictObject({
    event: z.strictObject({
      ...communityEvent,
      // As the organisers wrote it, in Markdown.
      description: z.string(),
    }),
  }),
);

// One event, by Partake's number for it.
const EventParams = z.object({
  id: z.coerce
    .number({error: "That isn't an event's number."})
    .int({error: "That isn't an event's number."})
    .min(1, {error: "That isn't an event's number."})
    .max(MAX_EVENT_ID, {error: "That isn't an event's number."}),
});

export {EventPageResponse, EventParams, EventsResponse};
