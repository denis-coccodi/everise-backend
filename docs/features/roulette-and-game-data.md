---
title: Duty Roulette and game data
parent: Features
nav_order: 8
---

# Duty Roulette and game data

Frontend: [Duty Roulette and game data](/docs/frontend/features/roulette-and-game-data.html). Players' guide: [site guide](/guide/).

## Game data (`src/duties`)

The backend keeps a copy of FINAL FANTASY XIV game data from [XIVAPI](https://v2.xivapi.com/api/docs): every duty and duty roulette, the combat jobs, and the images they refer to.

- **`GET /api/duties`:** duty groups (Dungeons, Trials — Extreme, Raids — Savage, Alliance Raids…), each duty with:
  - level and item level, expansion, and finder (`Duty Finder`, `Raid Finder` or neither);
  - the Duty Finder settings it allows;
  - the roulettes it belongs to.
- **`GET /api/roulettes`:** the duty roulettes.
- **`GET /api/jobs`:** the Disciple of War and Magic jobs in the game's order, with role and icon. Blue Mage and Beastmaster are marked `limited`.
- **`GET /api/images/:id`:** game icons (PNG) and banners (JPEG), cached by browsers for a week.
- **`GET /api/frontline`:** today's Frontline map and the 8-day cycle. The rotation is computed from `src/duties/frontline-rotation.ts`, since it isn't in the game data.
- **`GET /api/resets`:** the game day and week in progress.

**Grouping quirks:** some of the game's flags are unreliable, so the grouping relies on names and types.

- Extreme, Unreal and Savage duties are recognised by name, and alliance raids by their 24-player party size.
- Quest battles and tutorials are left out.

### Refreshing it

Run the **Refresh game data from XIVAPI** workflow after a game patch. It calls:

1. **`POST /api/duties/refresh`** (`X-Refresh-Key`), which downloads the duties, roulettes and jobs again. A failure answers 502 and leaves the cached data unchanged.
2. **`POST /api/duties/refresh/images`**, which downloads the next 25 images. A Worker may make 50 outbound requests per call, so the roughly 530 images take about 22 calls.
   - Until a batch replaces an image, the old copy is still served.
   - After the last batch, images the new data no longer uses are deleted.

### Resets

- **Times:** the daily reset is at 15:00 UTC and the weekly reset on Tuesdays at 08:00 UTC (`src/duties/resets.ts`). They stay on UTC all year, so their local time moves with daylight saving.
- **Time zones:** the API gives every time in UTC, and the site shows it in the reader's time zone.

## Roulette results (`src/roulette-posts`)

- **The card:** an accepted result is posted to the feeds as an article tagged `roulette`, with a `roulette` card the frontend draws like the game's "Duty Found" window.
- **`POST /api/roulette-results`** takes only what the reels landed on, as ids: `{result: {type, candidate, mode, jobId?}, comment?, shareToDiscord?}`.
  - The backend checks it's a result the roulette can produce, and builds the card itself.
  - Anything else gets 422.
- **Signed in:** the result is posted as the member, with their comment (up to 280 characters).
- **Not signed in:** it's posted by **Tataru**, the Waking Sands character, with a line the AI writes in her voice about what the guest got. Its Neurons are charged to `guests`.
- **Limits:**
  - one result every 15 s per member;
  - one a minute per guest address (stored hashed);
  - 60 guest results an hour in all.
