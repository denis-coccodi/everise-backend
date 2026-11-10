---
title: Events and Venues
parent: Features
nav_order: 5
---

# Events and Venues

Both are open to everyone, and neither is stored in the database: they're kept in memory between requests.

## Events (Partake, `src/events`)

- **Source:** Partake's GraphQL API (`api.partake.gg`), asked with GET so the answers can be cached.
- **Content filter:** only events rated EVERYONE, TEEN or MATURE. **ADULT is never shown**, nor are events without times (`isShown`, `src/events/event.ts`).
- **Cached, not polled,** as Partake asks:
  - read at most every 5 minutes, and only while someone is looking;
  - reads happen in windows starting on a multiple of 5 minutes, so the Worker's instances share the cached answer;
  - one read at a time;
  - if Partake can't be reached, the last events stay for an hour, and a failed read is retried after 30 s.
- **`GET /api/events`:** events going on now or starting within 7 days, at most 200, those going on first. Each has its title, a plain-text summary (200 characters), times, location, world and data centre, banner, team, attendees, tags and Partake link.
- **`GET /api/events/:id`:** one event, with its full Markdown description.
  - Each event is read at most every 5 minutes, and the last 200 are kept.
  - Ended events still answer, so shared links keep working.
- **Venue matching:** an event names its venue only when the site is sure. It must be on the venue's world, and either at the house its location names (`event-places.ts` reads "Goblet > w13 > p43", "LB W7-P6") or run by the team whose Discord invite the venue gives. It must also be the only match on its data centre that week.
- **Sharing:** `POST /api/events/discord` `{eventId, comment?}`.
  - The event is read from Partake, never from the request, so only events the site shows can be shared, and only before they end.
  - Once a minute per member.

## Venues (FFXIV Venues, `src/venues`)

- **Source:** `api.ffxivvenues.com/v1/venue`, one data centre at a time.
- **Content filter:** only venues **safe for work and approved** by its team, with an opening within a week.
- **Caching:** each data centre is read at most every 5 minutes, only while someone is looking.
  - The last venues stay for an hour when the site can't be reached.
  - A failed read is retried after 30 s.
- **`GET /api/venues?dataCentre=Light`:** open-now first, then by next opening. Each has its name, banner, description, location ("Mist, Ward 14 (subdivision), Plot 33"), tags, links, notices and next opening (UTC).
- **`GET /api/venues/regions`:** the data centres with venues, by region.
- **`GET /api/venues/:id`:** one venue, with its regular openings and the week's Partake events held there.
- **Sharing:** `POST /api/venues/discord` `{venueId, comment?}`, once a minute per member.
