---
title: Market History
parent: Features
nav_order: 4
---

# Market History

One item's price over time on every world of a region, a line per world, so a player can see where it sells for least. Reading prices costs Universalis and XIVAPI requests and storage writes, so the history and the item search are for members; the regions and icons are open.

## Items (XIVAPI)

- `GET /api/market/items?search=` searches the items that have a market board category.
- `GET /api/market/items/:id` reads one back, for a shared link.
- `GET /api/market/icons/:id` serves the high-resolution icon, edge-cached.

## Prices (Universalis)

`GET /api/market/history?item=<id>&region=<europe|north-america|japan|oceania>&quality=all|nq|hq&from=<YYYY-MM-DD>` answers each world's days with sales: `{day, median, min, max, sales, quantity}`.
- `from` defaults to 30 days ago, and never goes before late October 2022, where Universalis' data starts.
- `median` is the middle price per unit, so a few sales at silly prices don't sway it.

## MarketHistoryHub

One Durable Object per item and region (`MARKET`, named `<region>:<item id>`).

**Storage:**
- **A row per world and month** in `history_months`, holding every day of that month as JSON (all/NQ/HQ median, min, max, sales, units).
- The free plan counts rows, not size, so a busy item's whole European history (about 22,000 world-days) is about 770 rows.
- What's still to read is in `history_gaps` and `history_state`. Kept days are never deleted.

**Reading:**
- **Only the days asked for are read.** The first request reads every world's last 30 days. An earlier `from` reads only the older days. Once the newest days are 15 minutes old, the next request reads the days since then.
- **World by world.** Universalis merges a region slowly and often times out (504); a single world answers in well under a second.
  - Each read is one world's window: at most 10,000 sales, whole days only.
  - The window starts at 90 days, doubles while reads come back under a quarter full, and halves when one fills up.
- **Alarms read the rest.** The object's own alarm reads 8 worlds at a time (Universalis allows 8 connections), 4 steps per alarm.
  - Meanwhile the answer says `complete: false` and `readBackTo`, and the page asks again every 2 seconds.
  - An alarm fires only while there's work, which the cron can't do.
- **Failures:**
  - a world Universalis fails for keeps its gap and is retried on the next step, while the other worlds are answered;
  - an alarm retries 15 seconds later;
  - a first request where nothing could be read answers 502.

## Free-plan budget

The tightest limit is 100,000 SQLite rows written per day, account-wide.
- A first look at an item writes about one row per world.
- A repeat look reads each world at most every 15 minutes.
- Only widening the range writes more.

## Cheapest listings now

`GET /api/market/listings?item=&region=&quality=` answers the region's 5 cheapest current listings, from one quick Universalis request. Nothing is stored; the browser caches the answer for a minute.
