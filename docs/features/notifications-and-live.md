---
title: Notifications and live updates
parent: Features
nav_order: 7
---

# Notifications and live updates

Frontend: [Notifications and live updates](/docs/frontend/features/notifications-and-live.html). Players' guide: [site guide](/guide/).

## Notifications (`src/notifications`)

A member hears when:

- someone **favourites** one of their posts, grouped per post ("Alisaie and 2 others liked your post");
- someone **comments** on one of their posts, grouped per post, with the newest comment's opening words;
- someone **follows** them;
- a **Party Finder listing** they shared is no longer up;
- an **admin changed their role**.

Rules:

- **Nobody hears about what they did themselves**, and the Waking Sands characters hear nothing.
- **Ids say what happened** (`favorite:<post>:<member>`, `comment:<comment>`, `follow:<followee>:<follower>`). Liking twice makes one notification, and undoing the action removes it.

The endpoints:

- **`GET /api/notifications`** answers the newest 100, grouped (at most 30 groups, each naming up to 3 members), with `unseenCount`.
- **Seen:** a group is seen once the member opens the list (`POST /api/notifications/seen`).
- **Read:** a group is read once its item is opened (`POST /api/notifications/:id/read`) or all are marked read (`POST /api/notifications/read`).
- **`GET /api/notifications/unseen`** is the cheap count the site asks for every minute.

## Live updates (`src/live`)

`GET /api/live` with a WebSocket upgrade subscribes to live updates.

- **Why a Durable Object:** a Worker can't hold connections open, so the sockets live in the `LiveHub` Durable Object. It uses Cloudflare's **WebSocket Hibernation API**: the object sleeps between events with the sockets kept open, so idle connections cost nothing.
- **Events** are JSON, one per message:
  - `article-created`: a new post, exactly as a signed-out reader would see it, so nothing personal is broadcast;
  - `sands-line`, `sands-presence`, `sands-writing`: The Waking Sands room.
- **Heartbeat:** the client sends `ping` every 25 seconds and gets `pong`, answered without waking the hub. Cloudflare closes sockets silent for about 100 seconds.
- **Origins:** only `BASE_URL`'s origin and `CORS_ORIGINS` may connect (403 otherwise).
- **Routing:** `src/worker.ts` sends `/api/live` WebSocket requests to the hub before Express sees them. Browsers connect same-origin through the frontend Worker (`wss://<site>/api/live`).
