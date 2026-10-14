import {z} from 'zod';

// A picture in a relayed message. `file` is our copy in R2 (for
// GET /api/relays/images/:file) when Discord's own address would expire
// (its attachments' links are signed for about a day); otherwise `url` is
// shown as it is (GIFs from Tenor, images from Imgur).
interface RelayImage {
  url: string;
  file?: string;
  width?: number;
  height?: number;
}

interface RelayEmbed {
  // Discord's kind of embed: `rich` (a bot's card), `image`, `gifv`, `link`…
  type: string;
  title?: string;
  url?: string;
  description?: string;
  // The card's edge colour, as a number (0xRRGGBB).
  color?: number;
  author?: {name: string; url?: string; iconUrl?: string};
  fields: {name: string; value: string; inline: boolean}[];
  image?: RelayImage;
  thumbnail?: RelayImage;
  // A GIF from Tenor plays as a video in Discord.
  video?: {url: string; width?: number; height?: number};
  footer?: string;
  timestamp?: string;
}

interface RelayAttachment extends RelayImage {
  name: string;
  contentType?: string;
}

// A message from a followed channel, as Discord sent it to ours: its text
// (Discord's Markdown, with custom emoji as <:name:id> and times as
// <t:seconds:style>), its embeds and attachments. Shown 1:1 by the site.
interface RelayMessage {
  id: string;
  postedAt: string;
  editedAt?: string;
  // The server it was copied from (a followed announcement channel), and
  // the name Discord shows for it ("Centurio Hunts (FFXIV) #light-train").
  sourceGuildId?: string;
  sourceName: string;
  content: string;
  embeds: RelayEmbed[];
  attachments: RelayAttachment[];
}

// Discord's message object, only the parts kept. Anything it adds or
// leaves out doesn't fail the read.
const optionalString = z.string().nullish();
const optionalNumber = z.number().nullish();
const DiscordImage = z
  .object({url: z.string(), width: optionalNumber, height: optionalNumber})
  .nullish()
  .catch(undefined);
const DiscordMessage = z.object({
  id: z.string(),
  timestamp: z.string(),
  edited_timestamp: optionalString,
  content: z.string().default(''),
  author: z.object({username: z.string()}).nullish(),
  message_reference: z.object({guild_id: optionalString}).nullish(),
  embeds: z
    .array(
      z.object({
        type: z.string().default('rich'),
        title: optionalString,
        url: optionalString,
        description: optionalString,
        color: optionalNumber,
        author: z
          .object({
            name: z.string(),
            url: optionalString,
            icon_url: optionalString,
          })
          .nullish()
          .catch(undefined),
        fields: z
          .array(
            z.object({
              name: z.string(),
              value: z.string(),
              inline: z.boolean().default(false),
            }),
          )
          .default([]),
        image: DiscordImage,
        thumbnail: DiscordImage,
        video: DiscordImage,
        footer: z.object({text: z.string()}).nullish().catch(undefined),
        timestamp: optionalString,
      }),
    )
    .default([]),
  attachments: z
    .array(
      z.object({
        url: z.string(),
        filename: z.string(),
        content_type: optionalString,
        width: optionalNumber,
        height: optionalNumber,
      }),
    )
    .default([]),
});

// Drops what Discord sent as null, so stored messages hold only what's set.
function image(raw: z.infer<typeof DiscordImage>): RelayImage | undefined {
  if (!raw) return undefined;
  return {
    url: raw.url,
    width: raw.width ?? undefined,
    height: raw.height ?? undefined,
  };
}

// Discord's dates (2026-10-13T08:44:06.887000+00:00) as the API's own.
function isoOf(date: string | null | undefined) {
  if (!date) return undefined;
  const at = new Date(date);
  return isNaN(at.getTime()) ? undefined : at.toISOString();
}

// One message from Discord's API, or undefined when it isn't one.
function relayMessage(raw: unknown): RelayMessage | undefined {
  const parsed = DiscordMessage.safeParse(raw);
  if (!parsed.success) return undefined;
  const message = parsed.data;
  const postedAt = isoOf(message.timestamp);
  if (!postedAt) return undefined;
  return {
    id: message.id,
    postedAt,
    editedAt: isoOf(message.edited_timestamp),
    sourceGuildId: message.message_reference?.guild_id ?? undefined,
    sourceName: message.author?.username ?? '',
    content: message.content,
    embeds: message.embeds.map(embed => ({
      type: embed.type,
      title: embed.title ?? undefined,
      url: embed.url ?? undefined,
      description: embed.description ?? undefined,
      color: embed.color ?? undefined,
      author: embed.author
        ? {
            name: embed.author.name,
            url: embed.author.url ?? undefined,
            iconUrl: embed.author.icon_url ?? undefined,
          }
        : undefined,
      fields: embed.fields,
      image: image(embed.image),
      thumbnail: image(embed.thumbnail),
      video: image(embed.video),
      footer: embed.footer?.text,
      timestamp: isoOf(embed.timestamp),
    })),
    attachments: message.attachments.map(attachment => ({
      name: attachment.filename,
      url: attachment.url,
      contentType: attachment.content_type ?? undefined,
      width: attachment.width ?? undefined,
      height: attachment.height ?? undefined,
    })),
  };
}

// Every picture in the message, to copy or to check for one.
function imagesOf(message: RelayMessage): RelayImage[] {
  return [
    ...message.embeds.flatMap(embed =>
      [embed.image, embed.thumbnail].filter(
        (image): image is RelayImage => !!image,
      ),
    ),
    ...message.attachments.filter(attachment =>
      attachment.contentType?.startsWith('image/'),
    ),
  ];
}

// Snowflake ids grow with time; compared as numbers, not as text.
function isNewer(id: string, than: string | undefined) {
  return than === undefined || BigInt(id) > BigInt(than);
}

export {
  RelayAttachment,
  RelayEmbed,
  RelayImage,
  RelayMessage,
  imagesOf,
  isNewer,
  relayMessage,
};
