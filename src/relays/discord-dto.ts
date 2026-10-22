interface RelayAttachment extends RelayImage {
  name: string;
  contentType?: string;
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

// A message from a followed channel, as Discord sent it to ours: its text
// (Discord's Markdown, with custom emoji as <:name:id> and times as
// <t:seconds:style>), its embeds and attachments. Shown 1:1 by the site.
interface RelayMessage {
  id: string;
  postedAt: string;
  editedAt?: string;
  // The server and channel it was copied from (a followed announcement
  // channel), and the name Discord shows for it ("Centurio Hunts (FFXIV)
  // #light-train-relay").
  sourceGuildId?: string;
  sourceChannelId?: string;
  sourceName: string;
  content: string;
  embeds: RelayEmbed[];
  attachments: RelayAttachment[];
}

export {RelayAttachment, RelayEmbed, RelayImage, RelayMessage};
