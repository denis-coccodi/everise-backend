---
title: Discord, Weekly and Hunts
parent: Features
nav_order: 2
---

# Discord, Weekly and Hunts

Frontend: [Discord, Weekly and Hunts](/docs/frontend/features/discord.html). Players' guide: [site guide](/guide/).

## Sharing to the Discord channel

Nothing goes to Discord unless a member asks. Everything is posted through the channel's webhook (`DISCORD_WEBHOOK_URL`, production only).

| What | How | Limit |
|---|---|---|
| A new post | `shareToDiscord` on `POST /api/articles` | — |
| An existing post | `POST /api/articles/:id/discord`, by its author or an admin | once a minute per member |
| A roulette result | `shareToDiscord` on `POST /api/roulette-results`, members only | — |
| A Party Finder listing | `POST /api/party-finder/posts` or `/discord` | 15 s / 1 minute |
| An event or a venue | `POST /api/events/discord`, `/api/venues/discord` | once a minute |

**Errors:**

- 429 with `Retry-After` when sharing too soon;
- 403 for anyone not allowed;
- 503 where Discord isn't set up;
- 502 when Discord refuses.

**Limits:** rate limits are leases in `postLimits`, taken in one step. Comments are 280 characters at most.

## Widget

`GET /api/discord/widget` (members only) reads the server's public widget (`DISCORD_GUILD_ID`) at most once a minute. It answers the server name, how many are online and up to 12 members, or `null` when the widget is off.

## Weekly and Hunts relays (`src/relays`)

The Everise Discord **follows** announcement channels on other servers. Discord copies each message into our channel, and the site shows those copies, 1:1 and open to guests.

### The channels

- **`DISCORD_WEEKLY_CHANNEL_ID`** follows:
  - Kaiyoko's Fashion Report infographics (server `620710123601526794`);
  - Overseas Casuals' Island Sanctuary workshop recommendations (server `1034534280757522442`).
  Members' own messages in that channel aren't shown.
- **`DISCORD_HUNTS_CHANNEL_ID`** follows the hunt groups' train announcements, today Centurio Hunts' `#light-train-relay` and `#chaos-train-relay`.
- **A train's data centre** comes from the world its text names in brackets (`**[Odin]**`), else from `DISCORD_HUNT_SOURCES` for its followed channel.

### How they're read

- **The bot:** `DISCORD_BOT_TOKEN`, with View Channel, Read Message History and the Message Content intent. On every cron run (every 2 minutes), it reads each channel's latest 50 messages.
- **What's stored:** messages are kept in `relayedPosts`, keyed by Discord's message id.
  - New messages are those newer than the last one looked at (`relayCursors`); edited ones are read again.
  - At most 10 are stored per read.
  - A message deleted in Discord is deleted here.
- **No history is kept:** only the latest Fashion Report, the latest Island Sanctuary season, and the current trains.

### How they're shown

- **Format:** content and embed texts are Discord Markdown, with custom emoji as `<:name:id>` and times as `<t:seconds:style>`; the frontend renders them.
- **Pictures:** Discord's file links expire within a day, so pictures are copied to R2 (`relays/<attachment id>.<ext>`) and served by `GET /api/relays/images/:file`, edge-cached for good. A copied picture is deleted with the last message that uses it.

### The week (`GET /api/weekly`)

- **Answer:** `{available, resets: {daily, weekly, grandCompany}, fashionReport, nextJudgingAt, islandSanctuary}`.
- **Resets:** daily at 15:00 UTC, weekly on Tuesday at 08:00 UTC, Grand Company at 20:00 UTC.
- **Fashion Report:** for its week's judging, Friday 08:00 UTC to the weekly reset. It stays shown until the next one.
- **Island Sanctuary season:** covers its whole week.

### Hunt trains (`GET /api/hunts?dataCentre=Light`)

- **Answer:** `{available, dataCentres, posts: [{dataCentre, startsAt, message}]}`, the latest start first.
- **Start time:** `startsAt` is the first Discord time in the text, or when it was posted.

Both answers are cached for a minute. The repository's `discord-relays` skill covers adding a hunt group, a data centre or a source, and finding a missing post.
