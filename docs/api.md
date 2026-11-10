---
title: API
nav_order: 3
---

# API

Live reference with every schema: [apis.everise.dev/api/docs](https://apis.everise.dev/api/docs) (Swagger UI) and [`/api/openapi.json`](https://apis.everise.dev/api/openapi.json).

## One definition per endpoint

Each endpoint is defined once with `route()` (`src/api`): its method and path, who may call it, zod schemas for its parameters, query and body, and a schema for each answer. That one definition:

- **checks each request.** An invalid request gets a 422 with one message per failing field, and the handler receives the values parsed and typed;
- **builds the OpenAPI 3.1 document;**
- **checks every answer in the tests.** With `CHECK_API_RESPONSES` on, an answer that doesn't match its schema, or a status the route doesn't declare, fails with a 500.

`openapi.json` at the repository root is a committed copy. `npm test` rewrites it when routes change and fails once, so the new copy is committed with the code. The frontend generates its API types from that file, and its CI fails when they drift.

## Auth levels

| Level | Meaning |
|---|---|
| (none) | Open to anyone |
| optional | Open to anyone; adds viewer-specific fields (`following`, `favorited`) when signed in |
| required | 401 without a valid token |
| admin | Also 403 for anyone who isn't an admin |
| key | Needs the `X-Refresh-Key` header (`DUTIES_REFRESH_KEY`) |

## Errors

- **Shape:** errors use the RealWorld shape, `{"errors": {"body": ["…"]}}`.
- **Form messages:** sign-up, sign-in and settings return messages written for the person filling in the form, all of them at once (`src/users/user-fields.ts`). "Wrong email or password." never says whether the email exists.
- **`HttpError`:** every deliberate error extends it (`src/errors`). It carries its status, any headers (`Retry-After`) and extra fields, so the one error handler needs no list of cases.
- **Anything else** is a 500 with "internal server error"; the details go to the log only.

## Ids in links

- Posts and members are identified by their ids (UUIDs) everywhere: in paths, in filters and in every answer. A title or a username can change; an id can't.
- Older links still work: a post is also found by its old slug, and a member by their username.

## Endpoints

### Accounts and sign-in

| Method | Path | Auth | What |
|---|---|---|---|
| POST | `/api/users` | | Register |
| POST | `/api/users/login` | | Sign in |
| POST | `/api/users/logout` | | Clear the auth cookie |
| POST | `/api/users/logout-everywhere` | required | Sign out on every device |
| POST | `/api/users/password-reset` | | Email a reset code |
| POST | `/api/users/password-reset/confirm` | | Set a new password with the code |
| POST | `/api/users/confirm-email` | | Open a confirmation link and sign in |
| POST | `/api/users/confirm-email/resend` | | Send the confirmation link again |
| GET | `/api/auth/providers` | | The sign-in providers set up |
| GET | `/api/auth/:provider` | | Start Google or Discord sign-in (redirect) |
| GET | `/api/auth/:provider/callback` | | The provider's redirect back |
| GET / PUT | `/api/user` | required | The current user / update settings |
| PUT / DELETE | `/api/user/image` | required | Upload or remove the profile picture |
| GET | `/api/profile-images/:id` | | An uploaded profile picture |

### Posts, comments, profiles, media

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/api/articles` | optional | List posts (`tag`, `author`, `favorited`, `limit`, `offset`) |
| GET | `/api/articles/feed` | required | Posts by followed members |
| POST | `/api/articles` | required | Create a post (`media`, `shareToDiscord`) |
| GET / PUT / DELETE | `/api/articles/:id` | optional / required | Read, update or delete |
| POST / DELETE | `/api/articles/:id/favorite` | required | Favourite or unfavourite |
| POST | `/api/articles/:id/discord` | required | Share in the Discord (author or admin) |
| GET / POST | `/api/articles/:id/comments` | optional / required | List or add comments |
| DELETE | `/api/articles/:id/comments/:commentId` | required | Delete your comment |
| GET | `/api/tags` | | List tags |
| GET | `/api/profiles/:id` | optional | A member's profile, or a character's (`character:<id>`) |
| POST / DELETE | `/api/profiles/:id/follow` | required | Follow or unfollow |
| POST | `/api/media` | required | Upload an image or GIF (the file as the body) |
| GET | `/api/media/:id` | | An uploaded image or GIF |
| GET | `/api/gifs/available` | | Whether GIF search is set up |
| GET | `/api/gifs` | required | GIPHY search (`q`, `offset`) |
| POST | `/api/roulette-results` | optional | Post an accepted roulette result |

### Notifications and live updates

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/api/notifications` | required | Grouped notifications and `unseenCount` |
| GET | `/api/notifications/unseen` | required | The badge count |
| POST | `/api/notifications/seen` | required | The list was opened |
| POST | `/api/notifications/read` | required | Mark all read |
| POST | `/api/notifications/:id/read` | required | Mark one read |
| GET | `/api/live` (WebSocket) | | Live updates |

### Discord, Weekly and Hunts

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/api/discord/widget` | required | Who's online on the Discord server |
| GET | `/api/discord/sharing` | | Whether sharing to Discord is available |
| GET | `/api/weekly` | | Resets, Fashion Report, Island Sanctuary |
| GET | `/api/hunts` | | Hunt trains (`?dataCentre=`) |
| GET | `/api/relays/images/:file` | | A relayed picture, copied to R2 |

### Party Finder, Events, Venues

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/api/party-finder` | | The listings of a data centre's physical data centre (`?dataCentre=Light`: Light and Chaos) |
| GET | `/api/party-finder/listings/:id` | | One listing while it's up |
| POST | `/api/party-finder/posts` | required | Share a listing as a post |
| POST | `/api/party-finder/discord` | required | Share a listing in the Discord only |
| GET | `/api/events`, `/api/events/:id` | | This week's events, or one |
| POST | `/api/events/discord` | required | Share an event in the Discord |
| GET | `/api/venues`, `/api/venues/regions`, `/api/venues/:id` | | Venues, regions, or one venue |
| POST | `/api/venues/discord` | required | Share a venue in the Discord |

### Market History

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/api/market/regions` | | Regions, data centres, worlds |
| GET | `/api/market/items?search=` | required | Market items by name (max 20) |
| GET | `/api/market/items/:id` | required | One item |
| GET | `/api/market/icons/:id` | | An item's icon (edge-cached) |
| GET | `/api/market/history` | required | Daily prices per world (`item`, `region`, `quality`, `from`) |
| GET | `/api/market/listings` | required | The 5 cheapest listings now |

### The Waking Sands

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/api/waking-sands/room` | | The room: characters, who's present, lines |
| POST / DELETE | `/api/waking-sands/room/characters/:id` | required | Bring a character in, or send them out |
| POST | `/api/waking-sands/room/lines` | required | Say something; answers arrive live |
| GET | `/api/waking-sands/characters/:id/picture` | | A character's picture |

### Game data

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/api/duties`, `/api/roulettes`, `/api/jobs` | | Duties by type, roulettes, combat jobs |
| GET | `/api/frontline` | | Today's Frontline map and the 8-day cycle |
| GET | `/api/resets` | | The game day and week in progress |
| GET | `/api/images/:id` | | A game image (icon, banner) |
| POST | `/api/duties/refresh` | key | Re-download the game data |
| POST | `/api/duties/refresh/images` | key | Download the next 25 game images |

### Fight planner (only with the `planner` flag on)

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/api/planner/available` | | Whether FFLogs is set up |
| GET | `/api/planner/reports/:code` | optional (guests limited) | A report's players and boss pulls |
| GET | `/api/planner/reports/:code/pulls/:pullId` | optional (guests limited) | One pull's timeline |
| GET | `/api/planner/reports/:code/pulls/:pullId/clears` | optional (guests limited) | Up to three other groups' kills |
| GET | `/api/planner/reports/:code/pulls/:pullId/script` | optional | The fight's mechanics (cactbot) |
| GET | `/api/planner/catalog` | | Jobs' actions, heals and mitigations |
| POST | `/api/planner/catalog/refresh` | key | Rebuild the action catalog |

### Admin and site

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/api/admin/users` | admin | Members and roles (`search`, `limit`, `offset`) |
| PUT | `/api/admin/users/:id/role` | admin | Make a member a `staging-tester` or `user` |
| DELETE | `/api/admin/users/:id` | admin | Delete a member and everything they posted |
| POST | `/api/admin/staging-access` | admin | Sync staging testers to Cloudflare Access |
| GET | `/api/admin/characters` | admin | The Waking Sands characters as admins edit them |
| PUT | `/api/admin/characters/:id` | admin | Change a character's title, personality or bio |
| PUT / DELETE | `/api/admin/characters/:id/image` | admin | Upload a character picture, or reset it |
| GET | `/api/sitemap` | | What `sitemap.xml` lists |
| GET | `/api/openapi.json`, `/api/docs` | | The API description and Swagger UI |
