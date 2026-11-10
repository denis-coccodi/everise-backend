---
title: Features
nav_order: 8
has_children: true
---

# Features

How each feature works inside the backend. Each has a [frontend twin](/docs/frontend/features/) for how it works in the browser, and the [site guide](/guide/) explains it to players.

| Feature | Module | Source of data | Who can use it |
|---|---|---|---|
| [Posts, comments and media](posts-and-media.md) | `src/articles`, `src/media`, `src/files` | Everise database, R2, GIPHY | Everyone reads; members write |
| [Discord, Weekly and Hunts](discord.md) | `src/discord`, `src/relays` | Discord webhook, widget and followed channels | Everyone reads the tabs; members share |
| [Party Finder](party-finder.md) | `src/party-finder`, `src/party-finder-shares` | xivpf.com | Everyone browses; members share |
| [Market History](market-history.md) | `src/market` | Universalis, XIVAPI | Members |
| [Events and Venues](events-and-venues.md) | `src/events`, `src/venues` | Partake, FFXIV Venues | Everyone browses; members share |
| [The Waking Sands](waking-sands.md) | `src/waking-sands` | Workers AI | Members |
| [Notifications and live updates](notifications-and-live.md) | `src/notifications`, `src/live` | Site activity | Members; everyone connected |
| [Duty Roulette and game data](roulette-and-game-data.md) | `src/duties`, `src/roulette-posts` | XIVAPI | Everyone |
| [Fight planner](fight-planner.md) | `src/planner` | FFLogs v2 API | Members; guests limited (`planner` flag) |
| [Admin](admin.md) | `src/admin` | `ADMIN_EMAILS` | Admins |
