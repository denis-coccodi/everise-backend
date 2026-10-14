---
name: discord-relays
description: Explains how the Weekly and Hunts tabs get their posts from channels the Everise Discord follows (src/relays), read by the Everise bot on every cron run, and how to inspect those channels, add a hunt group or data centre, add a relayed source, or find out why a message isn't shown. Use when working on src/relays, the /weekly or /hunts endpoints, the Discord bot, DISCORD_* relay settings, or when a post is missing from the Weekly or Hunts tab.
---

# Discord relays (Weekly and Hunts)

The README's "Weekly and hunt trains" section is the reference for what is shown and kept. This skill is about working on it.

## How it fits

- **Channels.** Two channels of the Everise Discord follow announcement channels of other servers (Discord's **Follow**): `DISCORD_WEEKLY_CHANNEL_ID` (Kaiyoko's Fashion Reporter, Overseas Casuals) and `DISCORD_HUNTS_CHANNEL_ID` (Centurio Hunts' `#light-train-relay` and `#chaos-train-relay`). Their ids are vars in `wrangler.jsonc`, top level and `env.staging` both.
- **The bot.** The Everise app's bot (Discord Developer Portal, the same application as "Sign in with Discord") reads them with `DISCORD_BOT_TOKEN`: a Worker secret on each environment, and in `.dev.vars` locally. The user sets it; never ask for it in chat. It needs View Channel and Read Message History on both channels and the **Message Content** intent; without the intent, messages come back with no text.
- **Reading.** `RelaySync.sync()` (`relay-sync.ts`) runs on every cron run (`jobs.readRelays`), reads each channel's latest 50 messages and handles at most 10 new or edited ones a read, oldest first. A first deploy takes a few runs to catch up.
- **Placing.** `placeOf` decides where a message goes. Weekly: by the source server (`FASHION_REPORT_SOURCE`, `ISLAND_SANCTUARY_SOURCE` in `relay-sync.ts`). Hunts: by the world the text names in brackets (`**[Odin]**`), else `DISCORD_HUNT_SOURCES` for its followed channel or server, else any world named (`hunt-trains.ts`). Only copies from followed channels count: members' own messages and Discord's notices (type 12, "… followed this channel") never do.
- **No history.** `relay-retention.ts` keeps only the latest Fashion Report and Island Sanctuary season, and per data centre the trains to come, running (2 hours) and the last that started.
- **Pictures.** Links to Discord's file server expire within a day, so `relay-images.ts` copies them to R2 (`relays/<file>`), served by `GET /api/relays/images/:file`.

## Inspect a channel

Run [scripts/peek-channel.mjs](scripts/peek-channel.mjs) from the repo root. It reads the token from `.dev.vars` and never prints it:

```
node .claude/skills/discord-relays/scripts/peek-channel.mjs <channel id> [count]
```

Each message shows its type, source server and channel, author, text, embeds (title, fields, image) and attachments. That's what `placeOf` sees. Use it before changing how messages are placed, and to find a new source's ids.

## Common tasks

- **A message isn't shown.** Read the cron run's logs (`smoke-test` skill, "Scheduled jobs"): every message passed over is logged once as `Relays: <id> from <name> (channel <id>, server <id>) isn't shown`. Then peek at the channel. Usual causes: a hunt post naming no world from a channel missing in `DISCORD_HUNT_SOURCES`, a source server that changed, or a message older than 8 days (weekly) or a day (hunts) on its first read.
- **Another data centre's hunts.** Follow a hunt group's announcement channel into the hunts channel. If its trains name their world in brackets, nothing else is needed. Otherwise add `<channel id>:<data centre>` to `DISCORD_HUNT_SOURCES` in both places in `wrangler.jsonc`. Data centre names are `DATA_CENTRE_NAMES` (`src/party-finder`); a name the game doesn't have is logged and ignored.
- **Another weekly source.** Add its server id as a constant in `relay-sync.ts`, a `RelayKind`, a case in `placeOf` and in `outdated`, and what `GET /api/weekly` answers (`relays-service.ts`, `relays-schemas.ts`). Then the frontend's `cdt-weekly`.
- **Tests.** `__tests__/relays` use the fake channels in `__tests__/utils/app.ts` (`relays.channels`, `relays.pictures`) and Discord message builders in `__tests__/utils/discord-messages.ts` (`fashionReport`, `islandSeason`, `huntTrain`, `HUNTS`). Build messages the way the peek script shows real ones.
- **Try it with real data.** With the token in `.dev.vars`: `npx wrangler dev --test-scheduled --port 8787 --persist-to <scratchpad>/state`, trigger runs (`smoke-test` skill), then `curl localhost:8787/api/weekly` and `/api/hunts`.
