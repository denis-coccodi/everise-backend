import {z} from 'zod';
import {requestSchema, responseSchema} from '../api';
import {DATA_CENTRE_NAMES} from '../party-finder';
import {MAX_SHARE_COMMENT} from './party-finder-shares-service';

// Which listing, by the data centre it's on and its id: the backend reads
// the listing itself, so nobody can share one that isn't in the game.
const listing = {
  dataCentre: z.enum(DATA_CENTRE_NAMES, {
    error: `Pick one of the game's data centres: ${DATA_CENTRE_NAMES.join(', ')}.`,
  }),
  listingId: z.string().min(1).max(100),
  comment: z
    .string()
    .max(MAX_SHARE_COMMENT, {
      error: `Keep the message to ${MAX_SHARE_COMMENT} characters.`,
    })
    .optional(),
};

const NewPartyFinderPost = requestSchema(
  'NewPartyFinderPost',
  z.object({
    ...listing,
    // Also announce the post in the Everise Discord.
    shareToDiscord: z.boolean().optional(),
  }),
);

const NewPartyFinderDiscordShare = requestSchema(
  'NewPartyFinderDiscordShare',
  z.object(listing),
);

const PartyFinderDiscordShareResponse = responseSchema(
  'PartyFinderDiscordShareResponse',
  z.strictObject({shared: z.literal(true)}),
);

export {
  NewPartyFinderDiscordShare,
  NewPartyFinderPost,
  PartyFinderDiscordShareResponse,
};
