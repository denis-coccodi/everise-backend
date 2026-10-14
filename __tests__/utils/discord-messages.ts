// Discord's message objects, as its API sends them, for the relayed
// channels' fake (relays in ./app).

// The servers the Everise Discord's channels follow.
const SOURCES = {
  fashionReport: '620710123601526794',
  islandSanctuary: '1034534280757522442',
  centurioHunts: '477720463292891137',
  chaosHunts: '1111',
  unknown: '3333',
};

// Discord's ids grow with time: milliseconds since 2015, shifted left 22
// bits, plus a count for messages of the same millisecond.
let sequence = 0;
function snowflake(at: Date) {
  const ms = BigInt(at.getTime() - Date.UTC(2015, 0, 1));
  return ((ms << 22n) + BigInt(sequence++ % 4096)).toString();
}

interface MessageOptions {
  at: string;
  // The server it was copied from; undefined: posted in our own channel.
  source?: string;
  sourceName?: string;
  content?: string;
  embeds?: unknown[];
  attachments?: unknown[];
  editedAt?: string;
}

function discordMessage(options: MessageOptions) {
  const at = new Date(options.at);
  return {
    id: snowflake(at),
    type: 0,
    timestamp: at.toISOString().replace('Z', '+00:00'),
    edited_timestamp: options.editedAt ?? null,
    content: options.content ?? '',
    author: {username: options.sourceName ?? 'Someone', bot: true},
    message_reference: options.source
      ? {type: 0, channel_id: '1', message_id: '2', guild_id: options.source}
      : undefined,
    embeds: options.embeds ?? [],
    attachments: options.attachments ?? [],
    flags: options.source ? 2 : 0,
  };
}

// A picture on Discord's file server, signed as Discord sends its links.
function discordFile(attachmentId: string, name = 'hint.png') {
  return `https://cdn.discordapp.com/attachments/620710316346703872/${attachmentId}/${name}?ex=6ad0bcbd&is=6acf6b3d&hm=2c8af7`;
}

// Kaiyoko's Fashion Report infographic.
function fashionReport(at: string, week: number, imageUrl: string) {
  return discordMessage({
    at,
    source: SOURCES.fashionReport,
    sourceName: 'Fashion Reporter #fashion-report-infographics',
    embeds: [
      {
        type: 'rich',
        url: 'https://fashionreportxiv.com/',
        title: `Fashion Report Week ${week} - Full Details`,
        image: {url: imageUrl, width: 1701, height: 957},
        thumbnail: {url: 'https://i.imgur.com/LQtX3AS.png', width: 42},
      },
    ],
  });
}

// Overseas Casuals' workshop recommendations, in two cards.
function islandSeason(at: string, season: number) {
  return discordMessage({
    at,
    source: SOURCES.islandSanctuary,
    sourceName: 'Overseas Casuals #🦜︱recommendations',
    content: '@Squawkbox *SQUAAAAAWK*',
    embeds: [
      {
        type: 'rich',
        title: `Season ${season} (Oct 13 - 19) Recommendations`,
        color: 2067276,
        fields: [
          {name: 'Cycle 1', value: ':zzz: Always Rest :zzz:', inline: false},
          {
            name: 'Cycle 2',
            value:
              '**First 3 Workshops**\n<:OC_Brush:1035379557081034753> Brush (4h)',
            inline: true,
          },
        ],
      },
      {
        type: 'rich',
        color: 2067276,
        timestamp: '2026-10-13T08:00:14.679000+00:00',
        fields: [{name: 'Total Weekly Value', value: '40,078', inline: false}],
      },
    ],
  });
}

// A hunt train announced by a hunt group, starting 10 minutes after it's
// posted (a Discord time in its text).
function huntTrain(at: string, source: string, world: string, extra = {}) {
  const starts = Math.floor(Date.parse(at) / 1000) + 600;
  return discordMessage({
    at,
    source,
    sourceName: 'Centurio Hunts (FFXIV) #🚆│light-train-relay',
    content: `@EWTrain **[${world}]** Hunt train starting <t:${starts}:R> at <:aetheryte:866773648450519082> ***Anagnorisis – Elpis***`,
    ...extra,
  });
}

export {
  SOURCES,
  discordFile,
  discordMessage,
  fashionReport,
  huntTrain,
  islandSeason,
};
