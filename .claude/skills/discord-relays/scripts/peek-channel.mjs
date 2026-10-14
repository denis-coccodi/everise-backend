// Prints the latest messages of a Discord channel as the Everise bot reads
// them: type, source server and channel (for a followed channel), author,
// the start of the text, embeds and attachments. Never prints the token.
//
//   node peek-channel.mjs <channel id> [count] [path to .dev.vars]
//
// The token is DISCORD_BOT_TOKEN in .dev.vars (git-ignored), by default the
// one in the current directory.
import {readFileSync} from 'node:fs';

const [channelId, count = '10', varsPath = '.dev.vars'] = process.argv.slice(2);
if (!channelId) {
  console.error(
    'Usage: node peek-channel.mjs <channel id> [count] [path to .dev.vars]',
  );
  process.exit(2);
}

let vars = '';
try {
  vars = readFileSync(varsPath, 'utf8');
} catch {
  console.error(`No ${varsPath}: run from the backend repo, or pass its path.`);
  process.exit(2);
}
const token = /^DISCORD_BOT_TOKEN=(.*)$/m
  .exec(vars)?.[1]
  ?.trim()
  .replace(/^"|"$/g, '');
if (!token) {
  console.error(
    `No DISCORD_BOT_TOKEN in ${varsPath}: the user adds it there themselves.`,
  );
  process.exit(2);
}

// Discord sends at most 100 messages a request.
const limit = Math.min(Number(count) || 10, 100);
const response = await fetch(
  `https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`,
  {
    headers: {Authorization: `Bot ${token}`},
  },
);
if (!response.ok) {
  // 401: wrong token. 403: the bot can't see the channel (View Channel,
  // Read Message History). 404: no such channel.
  console.error(
    `Discord answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
  );
  process.exit(1);
}

const cut = (text, length) =>
  (text ?? '').replace(/\s+/g, ' ').slice(0, length);
const unsigned = url => url?.split('?')[0];
for (const m of await response.json()) {
  const ref = m.message_reference ?? {};
  console.log(
    `--- ${m.id} ${m.timestamp} type ${m.type}${m.edited_timestamp ? ' (edited)' : ''}`,
  );
  console.log(
    `    from ${m.author?.username}${ref.guild_id ? ` | source server ${ref.guild_id}, channel ${ref.channel_id}` : ' | posted here'}`,
  );
  if (m.content) console.log(`    text: ${cut(m.content, 240)}`);
  for (const e of m.embeds ?? []) {
    const parts = [
      e.type,
      e.title && `"${cut(e.title, 80)}"`,
      e.fields?.length && `${e.fields.length} fields`,
    ];
    if (e.image) parts.push(`image ${unsigned(e.image.url)}`);
    if (e.thumbnail) parts.push(`thumbnail ${unsigned(e.thumbnail.url)}`);
    console.log(`    embed: ${parts.filter(Boolean).join(', ')}`);
  }
  for (const a of m.attachments ?? [])
    console.log(`    attachment: ${a.filename} ${a.content_type} ${a.size} B`);
}
