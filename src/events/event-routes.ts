import {EventsFetch} from './event';
import {EventPages} from './event-pages';
import {EventsBoard} from './events-board';
import {EventsRouter} from './events-router';

// Everything the Events need, put together for the app (src/app.ts): the
// week's events and each event's page.
function eventRoutes(parts: {fetch: EventsFetch; now: () => Date}) {
  return new EventsRouter(
    new EventsBoard(parts.fetch, parts.now),
    new EventPages(parts.fetch, parts.now),
  ).router;
}

export {eventRoutes};
