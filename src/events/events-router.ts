import * as express from 'express';
import {route} from '../api';
import {NotFoundError, UpstreamError} from '../errors';
import {EventPages} from './event-pages';
import {EventPageResponse, EventParams, EventsResponse} from './event-schemas';
import {EventsBoard} from './events-board';

// The Events page: the community's events in the coming week, as Partake
// lists them, and each event's own page. Open to everyone.
class EventsRouter {
  constructor(
    private readonly board: EventsBoard,
    private readonly pages: EventPages,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/events',
        summary: 'The community events going on or starting this week',
        responses: {
          200: {description: 'The events.', schema: EventsResponse},
        },
      },
      async (_req, res) => {
        const list = await this.board.events();
        if (!list) throw unreachable();
        // The same for everyone, and fresh for a while.
        res.set('Cache-Control', 'public, max-age=60').json(list);
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/events/:id',
        summary: 'One community event',
        params: EventParams,
        responses: {
          200: {description: 'The event.', schema: EventPageResponse},
        },
      },
      async (req, res) => {
        const event = await this.pages.event(req.params.id);
        if (event === null) throw unreachable();
        if (!event) {
          throw new NotFoundError(
            "That event isn't listed here: it may have been removed from Partake, or isn't one the site shows. Find another on the Events page.",
          );
        }
        res.set('Cache-Control', 'public, max-age=60').json({event});
      },
    );

    return router;
  }
}

function unreachable() {
  return new UpstreamError(
    "The events can't be reached right now. Try again in a few minutes.",
  );
}

export {EventsRouter};
