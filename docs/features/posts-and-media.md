---
title: Posts, comments and media
parent: Features
nav_order: 1
---

# Posts, comments and media

## Posts and comments

- Posts (`articles`) and comments are Markdown. Anyone reads them; members write, favourite and follow.
- `GET /api/articles` lists posts with `tag`, `author` and `favorited` filters, and `limit`/`offset` paging. `GET /api/articles/feed` lists the posts of the people a member follows.
- Deleting a post deletes its comments too.
- Two kinds of post carry a card the frontend draws:
  - **`roulette`**: a roulette result, posted through `POST /api/roulette-results` (see [Duty Roulette](roulette-and-game-data.md));
  - **`partyFinder`**: a shared listing (see [Party Finder](party-finder.md)).

## Attachments

- **How many:** a post has up to 4 images, GIFs or YouTube videos (`media` in `POST`/`PUT /api/articles`); a comment has at most one.
- **Format:** each is `{kind: "image" | "gif" | "video", url, alt?, width?, height?}`, checked in `src/media/attachments.ts`. Images need an https address or must be the site's own uploads; a video must be a YouTube link.
- **Ownership:** an upload starts unattached, and the post or comment that uses it claims it. Deleting the post or comment, or removing the attachment in an edit, deletes the author's own uploads it used.
- **Cleanup:** an upload never attached is deleted a day later, the next time its owner uploads.
- **Older posts** had their media in the text, as Markdown images and YouTube links on their own line. They're read as attachments, so they show like new posts.

## Uploads (`POST /api/media`)

- **Formats:** PNG, JPEG, WebP or GIF, detected from the file's bytes, never from the content type.
- **Size:** up to **1 MB** and 4096 × 4096 pixels. The site shrinks larger pictures first; a GIF keeps its animation, so it must already fit.
- **Per member:** 30 uploads a day (then 429 with `Retry-After`), and at most **100 MB** kept.
- **Whole site:** all uploads and profile pictures together stay under `UPLOAD_STORAGE_MB`, counted in `siteStorage`.
- **Where they're kept:** bytes in R2 under `media/<id>`, details in a `media` document.

## Profile pictures

- `PUT /api/user/image` takes the file itself as the body. The previous picture is deleted.
- **Limits:** 300 KB and 500 × 500 pixels; PNG, JPEG, WebP or GIF, detected from the bytes. Breaking a limit gives 413 (size) or 422 (pixels, format).
- `GET /api/profile-images/:id` serves the picture with its detected type, `nosniff` and a sandboxing CSP, cached for a year (each upload gets a new id).
- `DELETE /api/user/image` goes back to the default picture.

## GIF search

- `GET /api/gifs?q=…&offset=…` (members) is GIPHY's search, or trending GIFs without `q`, rated PG-13 at most, 24 a page.
- The backend calls GIPHY itself, so `GIPHY_API_KEY` stays secret.
- Without the key, `GET /api/gifs/available` says `false` and the site hides the search.

## Per-member settings on the user

- **`darkMode`:** the colour mode, `true` until turned off. It follows the member to every browser.
- **`characterName` and `server`:** set both or neither.
  - The name follows the game's rules: forename and surname of 2–15 letters each, 20 letters in all.
  - The world is one of the game's public worlds.
  - Once set, the site calls the member by them (`displayName`, e.g. "Avar Kriss (Odin)").
