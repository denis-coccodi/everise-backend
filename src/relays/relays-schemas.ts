import {z} from 'zod';
import {isoDate, responseSchema} from '../api';
import {DATA_CENTRE_NAMES} from '../party-finder';

const size = {
  width: z.number().optional(),
  height: z.number().optional(),
};

// A picture: `file` (for GET /api/relays/images/:file) when it's kept here,
// else `url` as Discord had it.
const RelayImage = responseSchema(
  'RelayImage',
  z.strictObject({url: z.string(), file: z.string().optional(), ...size}),
);

const RelayEmbed = responseSchema(
  'RelayEmbed',
  z.strictObject({
    // Discord's kind: rich (a bot's card), image, gifv, link…
    type: z.string(),
    title: z.string().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
    // The card's edge colour (0xRRGGBB).
    color: z.number().optional(),
    author: z
      .strictObject({
        name: z.string(),
        url: z.string().optional(),
        iconUrl: z.string().optional(),
      })
      .optional(),
    fields: z.array(
      z.strictObject({
        name: z.string(),
        value: z.string(),
        inline: z.boolean(),
      }),
    ),
    image: RelayImage.optional(),
    thumbnail: RelayImage.optional(),
    video: z.strictObject({url: z.string(), ...size}).optional(),
    footer: z.string().optional(),
    timestamp: isoDate.optional(),
  }),
);

// A message as Discord shows it: `content` and the embeds' texts are
// Discord's Markdown (custom emoji as <:name:id> or <a:name:id>, at
// https://cdn.discordapp.com/emojis/<id>; times as <t:seconds:style>).
const RelayMessage = responseSchema(
  'RelayMessage',
  z.strictObject({
    id: z.string(),
    postedAt: isoDate,
    editedAt: isoDate.optional(),
    // The server it was copied from, and the name Discord shows for it.
    sourceGuildId: z.string().optional(),
    sourceName: z.string(),
    content: z.string(),
    embeds: z.array(RelayEmbed),
    attachments: z.array(
      RelayImage.extend({
        name: z.string(),
        contentType: z.string().optional(),
      }),
    ),
  }),
);

// A weekly post, with the days it's for.
const WeeklyPost = z.strictObject({
  message: RelayMessage,
  validFrom: isoDate,
  validUntil: isoDate,
});

const WeeklyResponse = responseSchema(
  'WeeklyResponse',
  z.strictObject({
    // The channels are read (the Discord bot is set up).
    available: z.boolean(),
    // When the next of each reset comes.
    resets: z.strictObject({
      daily: isoDate,
      weekly: isoDate,
      grandCompany: isoDate,
    }),
    // The latest Fashion Report, for Friday's judging to the weekly reset.
    fashionReport: WeeklyPost.nullable(),
    // When the next judging opens: this week's, or next week's from Friday.
    nextJudgingAt: isoDate,
    // The latest Island Sanctuary recommendations, for their whole week.
    islandSanctuary: WeeklyPost.nullable(),
  }),
);

const HuntsQuery = z.object({
  dataCentre: z
    .enum(DATA_CENTRE_NAMES, {
      error: `Pick one of the game's data centres: ${DATA_CENTRE_NAMES.join(', ')}.`,
    })
    .optional(),
});

const HuntsResponse = responseSchema(
  'HuntsResponse',
  z.strictObject({
    available: z.boolean(),
    // The data centres whose hunt groups are relayed.
    dataCentres: z.array(z.enum(DATA_CENTRE_NAMES)),
    // The latest start first.
    posts: z.array(
      z.strictObject({
        dataCentre: z.enum(DATA_CENTRE_NAMES),
        // When it starts: the time in its text, or when it was posted.
        startsAt: isoDate,
        message: RelayMessage,
      }),
    ),
  }),
);

const RelayImageParams = z.object({file: z.string().max(40)});

export {HuntsQuery, HuntsResponse, RelayImageParams, WeeklyResponse};
