# EveriseDb collections

Every collection of the `docs` table, its fields (besides `id`, `createdAt`, `updatedAt`), and where it's defined. Fields a service filters on are indexed (`INDEXED` in `src/db/sql-schema.ts`).

| Collection | Fields (besides id/createdAt/updatedAt) | Defined in |
| --- | --- | --- |
| `users` | email, username, passwordHash? (unset: signs in only through a provider), googleId?, discordId? (the provider accounts tied to it), bio?, image?, darkMode? (unset: dark), role? (`staging-tester`; unset: user; admins come from `ADMIN_EMAILS`, never stored), emailConfirmed? (false until a password sign-up opens its link; unset: confirmed), pendingEmail? (a new address waiting for its link), sessionVersion? (in every token; raised when the password changes or the member signs out everywhere, which ends older sessions; unset: 0) | `src/users/user-doc.ts` (`UserDoc`) |
| `follows` | followerId → users, followeeId → users | `src/profiles/profiles-service.ts` |
| `articles` | authorId → users (or `character:<id>` for a Waking Sands character's post: Tataru's, of guests' roulette results), slug? (only on posts from before ids were in links, so their old links still work), title, description, body, tags[], favoritedBy[] → users, media? (up to 4 attachments: image, gif or YouTube video; unset on posts from before, whose media is in the body), roulette? (a roulette result card), partyFinder? (a shared Party Finder listing as it was: dataCentre, icons, listing) | `src/articles/article-docs.ts` (`ArticleDoc`) |
| `comments` | articleId → articles, authorId → users, body, media? (one attachment) | `src/articles/article-docs.ts` (`CommentDoc`) |
| `media` | userId → users, contentType, width, height, size (bytes; the file is in R2 at `media/<id>`, ≤ 1 MB; older uploads have `data` instead until first read), uploadedAt (ms, the daily limit), attached? (false until a post or comment uses it; swept a day later) | `src/media/media-service.ts` (`MediaDoc`) |
| `emailConfirmations` | userId → users, email (the address the link went to), tokenHash (SHA-256), expiresAt, lastSentAt, sendsToday, dayStartedAt (one per account; deleted when opened) | `src/users/email-confirmation.ts` (`ConfirmationDoc`) |
| `passwordResets` | userId → users, codeHash (SHA-256 of the 8-letter code, which alone finds the account), expiresAt (15 minutes), lastSentAt, sendsToday, dayStartedAt (one per account; deleted when used) | `src/users/password-reset.ts` (`PasswordResetDoc`) |
| `signInFailures` | count, windowStartedAt (ms) (id: SHA-256 of the lowercased email address, so no address is stored; wrong passwords at sign-in within 15 minutes; deleted on a right one) | `src/users/sign-in-limit.ts` (`SignInFailuresDoc`) |
| `postLimits` | lastPostAt?, or windowStart? and count? (id: `user-<id>`, `guest-<hashed address>`, `guests`); until (id: `pf-post-<id>`, `pf-discord-<id>`, `post-discord-<id>`, `event-discord-<id>`, `venue-discord-<id>`: when a member may share a listing, post, event or venue again) | `src/roulette-posts/roulette-posts-service.ts`, `src/party-finder-shares/party-finder-shares-service.ts`, `src/articles/article-shares-service.ts`, `src/events/event-shares-service.ts`, `src/venues/venue-shares-service.ts` |
| `profileImages` | userId → users (or `character:<id>` for a Waking Sands character's picture), contentType, size (bytes; the file is in R2 at `profile-images/<id>`, ≤ 300 KB; older pictures have `data` instead until first read); `users.image` holds its URL | `src/users/profile-images-service.ts` (`ProfileImageDoc`) |
| `characters` | title?, persona?, bio? (their profile's), image? (an uploaded picture's URL; the file is a `profileImages` document owned by `character:<id>`) (id: the character's id, e.g. `barnaby`; unset fields keep the default from `src/waking-sands/cast/`) | `src/waking-sands/characters-service.ts` (`CharacterDoc`) |
| `sandsLines` | at (ms, strictly increasing), from (`member`, `note` or a character id), name, image?, userId? → users (a member's line), text (the room's last day, at most 200; older ones deleted on write) | `src/waking-sands/sands-docs.ts` (`LineDoc`) |
| `sandsRoom` | present[] (character ids), busyUntil (ms; a round of answers is running) (one document, id `room`) | `src/waking-sands/sands-docs.ts` (`RoomDoc`) |
| `siteStorage` | bytes (id: `uploads`; everyone's uploads in R2, against `UPLOAD_STORAGE_MB`) | `src/files/upload-storage.ts` |
| `notifications` | userId → users (who it is for), type (`favorite`, `comment` or `follow`), actorId → users and actor {id, username, image} (who did it, as they were then), articleId? → articles and articleTitle?, commentId? → comments and commentExcerpt?, at (ms), seen, read (id: `favorite:<article>:<member>`, `follow:<followee>:<follower>` or `comment:<comment>`: one per thing that happened; undoing it deletes it; the site's own, without actor: `pf-ended:<share>` with partyFinder {listingId, dataCentre, title}, `role:<member>:<ms>` with role) | `src/notifications/notification-docs.ts` (`NotificationDoc`) |
| `sharedListings` | listingId, dataCentre, title, sharerId → users, sharerName, articleId? → articles (shared as a post), discord (shared in the Discord too, or only) (watched by the cron trigger until the listing is off its board, then deleted; older shares may still hold an unused expiresAt) | `src/party-finder-shares/shared-listings.ts` (`SharedListingDoc`) |
| `relayedPosts` | channel (`weekly` or `hunts`), kind (`fashion-report`, `island-sanctuary`, `hunt`), dataCentre? (a hunt train's, from its source server), postedAt, startsAt? (a hunt train's start: the time in its text, or postedAt), message (the Discord message as it was sent: content, embeds, attachments; pictures from Discord's file server copied to R2 at `relays/<file>`) (id: Discord's message id; no history: only the latest Fashion Report and Island Sanctuary season, and per data centre the hunt trains to come, running (2 hours) and the last started; deleted when deleted in Discord) | `src/relays/relay-docs.ts` (`RelayedPostDoc`) |
| `relayCursors` | lastId (the newest Discord message looked at in the channel) (id: `weekly` or `hunts`) | `src/relays/relay-docs.ts` (`RelayCursorDoc`) |
| `chatUsage` | neurons, members ({users.id or `guests`: Neurons}) (id: the UTC day, `YYYY-MM-DD`; the Waking Sands daily limits) | `src/waking-sands/sands-docs.ts` (`UsageDoc`) |
| `demoContent` | ids ({collection: ids[]}: every document the demo content added, so it can be removed) (one document, id `added`; its presence means the site shows demo content) | `src/demo/demo-content-service.ts` (`DemoRecordDoc`) |

Tags and favorites have no collection of their own; they are arrays on articles.

Verify this table against the `*Doc` interfaces and `this.db.create(...)` calls before relying on it.

## Cached game data

The FFXIV data from XIVAPI (`src/duties`). Every refresh (`POST /api/duties/refresh`) replaces it, so it can be rebuilt at any time.

| Collection | Fields (besides id/createdAt/updatedAt) | Defined in |
| --- | --- | --- |
| `dutyGroups` | a duty group (`DutyGroup`: its duties, their levels, types and images), one document each | `src/duties/duties-service.ts` (`DutyGroupDoc`) |
| `dutyRoulettes` | roulettes[], icon (one document) | `src/duties/duties-service.ts` (`RoulettesDoc`) |
| `jobs` | jobs[] (one document) | `src/duties/duties-service.ts` (`JobsDoc`) |
| `dutyRefreshes` | dataVersion, fetchedAt, dutyCount, rouletteCount, jobCount (one per refresh) | `src/duties/duties-service.ts` (`RefreshDoc`) |
| `gameImages` | contentType (id: the game's icon id; the bytes are in R2 at `game-images/<id>`; images stored before have `data` instead, until first read) | `src/duties/images-service.ts` (`ImageDoc`) |
| `gameImageDownloads` | images[], pending[], failed[] (the current refresh's downloads); and the document `index`: ids[] of every stored image | `src/duties/images-service.ts` (`DownloadsDoc`, `IndexDoc`) |
