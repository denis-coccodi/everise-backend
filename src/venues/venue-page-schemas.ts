import {z} from 'zod';
import {isoDate, requestSchema, responseSchema} from '../api';
import {VenueDataCentreName, shownVenue} from './venue-schemas';
import {MAX_VENUE_SHARE_COMMENT} from './venue-shares-service';

// An opening's times, in UTC: the page shows them in the visitor's time.
const opening = {opensAt: isoDate, closesAt: isoDate};

const VenueDetail = z.strictObject({
  ...shownVenue,
  // The data centre it's on; null when FFXIV Venues doesn't say.
  dataCentre: VenueDataCentreName.nullable(),
  // Its next opening, or the one going on (openNow); null when it has none
  // set (closed for a while).
  nextOpening: z.strictObject({...opening, openNow: z.boolean()}).nullable(),
  // Its regular openings, the next first: each one's next date (its weekday
  // and times) and how it comes back, every n weeks, or on one week of the
  // month (1 for the first, -1 for the last) on that weekday.
  schedule: z.array(
    z.strictObject({
      ...opening,
      repeat: z.discriminatedUnion('every', [
        z.strictObject({
          every: z.literal('weeks'),
          weeks: z.number().int().min(1),
        }),
        z.strictObject({every: z.literal('month'), week: z.number().int()}),
      ]),
    }),
  ),
});

const VenuePageResponse = responseSchema(
  'VenuePageResponse',
  z.strictObject({venue: VenueDetail}),
);

// One venue, by FFXIV Venues' id for it.
const VenueParams = z.object({id: z.string().min(1).max(64)});

// Sharing a venue in the Everise Discord: the backend reads the venue
// itself, so only the venues the site shows can be shared.
const NewVenueDiscordShare = requestSchema(
  'NewVenueDiscordShare',
  z.object({
    venueId: z.string().min(1).max(64),
    comment: z
      .string()
      .max(MAX_VENUE_SHARE_COMMENT, {
        error: `Keep the message to ${MAX_VENUE_SHARE_COMMENT} characters.`,
      })
      .optional(),
  }),
);

const VenueDiscordShareResponse = responseSchema(
  'VenueDiscordShareResponse',
  z.strictObject({shared: z.literal(true)}),
);

export {
  NewVenueDiscordShare,
  VenueDiscordShareResponse,
  VenuePageResponse,
  VenueParams,
};
