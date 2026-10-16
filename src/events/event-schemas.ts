import {z} from 'zod';
import {isoDate, requestSchema, responseSchema} from '../api';
import {SHOWN_RATINGS} from './event';
import {MAX_EVENT_SHARE_COMMENT} from './event-shares-service';

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

const NOT_AN_ID = "That isn't an event's number.";
const eventId = (number: z.ZodNumber) =>
  number
    .int({error: NOT_AN_ID})
    .min(1, {error: NOT_AN_ID})
    .max(MAX_EVENT_ID, {error: NOT_AN_ID});

// One event, by Partake's number for it.
const EventParams = z.object({
  id: eventId(z.coerce.number({error: NOT_AN_ID})),
});

// Sharing an event in the Everise Discord: the backend reads the event
// itself, so only the events the site shows can be shared.
const NewEventDiscordShare = requestSchema(
  'NewEventDiscordShare',
  z.object({
    eventId: eventId(z.number({error: NOT_AN_ID})),
    comment: z
      .string()
      .max(MAX_EVENT_SHARE_COMMENT, {
        error: `Keep the message to ${MAX_EVENT_SHARE_COMMENT} characters.`,
      })
      .optional(),
  }),
);

const EventDiscordShareResponse = responseSchema(
  'EventDiscordShareResponse',
  z.strictObject({shared: z.literal(true)}),
);

export {
  EventDiscordShareResponse,
  EventPageResponse,
  EventParams,
  EventsResponse,
  NewEventDiscordShare,
};
