---
title: Party Finder
parent: Features
nav_order: 3
---

# Party Finder

Frontend: [Party Finder](/docs/frontend/features/party-finder.html). Players' guide: [site guide](/guide/).

## Where the listings come from

Square Enix has no Party Finder API. [xivpf.com](https://xivpf.com/listings) collects listings from players who run the Remote Party Finder plugin (Dalamud), so a quiet data centre or hour can show few. Its `GET /api/listings` has no filters: it always sends every listing in the game, about 1.3 MB.

## PartyFinderHub

Parsing that takes more CPU than a Worker request may use (10 ms), so the `PartyFinderHub` Durable Object (`PARTY_FINDER`, up to 30 s) holds the board in memory. It:

- reads xivpf **at most once a minute, and only while someone asks**;
- keeps the followed data centres' listings (`data-centres.ts`);
- drops listings whose time ran out, or that no plugin has reported for **5 minutes**. xivpf never hears that a party filled up, so without this the page showed about three times what the game did;
- keeps the last listings for 15 minutes when xivpf is down. With none, it answers 502.

## Cleaning up xivpf's data

- **Beastmaster slots:** an open slot only a Beastmaster may join comes with no jobs (xivpf's job list predates it). Such a slot is read as open to BST and shown as a DPS slot (`xivpf-listing.ts`).
- **Duty names:** xivpf names every duty from the game's duty list, even when the number means a treasure map, deep dungeon or roulette (its issues #14 and #22).
  - Only the names of `Normal` listings are kept.
  - For the others, the number is read back from the wrong name and looked up in the Party Finder's own lists (`xivpf-duties.ts`).
  - Unknown numbers, FATEs and the Hunt give `duty: null`.
- **Order and icons:** each listing gets its duty's `level`, `sortKey` (the game's order) and `dutyIcon` from the duty data, which is re-read every 10 minutes.

## API

- `GET /api/party-finder?dataCentre=Light` answers `{dataCentre, worlds, regions, fetchedAt, icons, listings, counts}`. `regions` lists every data centre by region, Europe first; `counts` says how many listings are up on each (`{dataCentre, listings}`), for the page's data centre picker.
- `GET /api/party-finder/listings/:id` answers one listing while it's up, 404 after.

## Sharing (`src/party-finder-shares`)

Members name a listing by `{dataCentre, listingId}`. The backend reads it from the board itself, so only listings up in the game can be shared.

- **`POST /api/party-finder/posts`** posts to the feeds, once every 15 s per member.
  - The post is titled `Party Finder: <duty>` and tagged `party-finder`.
  - `partyFinder` holds the listing as it was then.
  - `shareToDiscord` sends it to the Discord too.
- **`POST /api/party-finder/discord`** sends it to the Discord only, linking to the listing's own page. Once a minute per member.
- **`pictureId`** (optional): the listing's card as a picture, drawn in the member's browser and uploaded first. It must be the member's own upload.

## Ended listings

- **Tracking:** every shared listing is kept in `sharedListings`.
- **Checking:** on every cron run (every 2 minutes), the boards of the data centres with shared listings are read through the hub.
- **When a listing is gone:**
  - the sharer gets a `pf-ended` notification;
  - if it went to the Discord, the channel is told it's no longer up.
