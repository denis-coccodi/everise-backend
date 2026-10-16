import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {Auth} from '../middleware';
import {EventPages} from './event-pages';
import {
  EventDiscordShareResponse,
  EventPageResponse,
  EventParams,
  EventsResponse,
  NewEventDiscordShare,
} from './event-schemas';
import {
  EventSharesService,
  notListed,
  unreachable,
} from './event-shares-service';
import {VenueLookup} from './event-places';
import {EventsBoard} from './events-board';

// The Events page: the community's events in the coming week, as Partake
// lists them, and each event's own page (open to everyone); and sharing an
// event in the Everise Discord (for members), which links back to its page.
class EventsRouter {
  constructor(
    private readonly auth: Auth,
    private readonly board: EventsBoard,
    private readonly pages: EventPages,
    private readonly shares: EventSharesService,
    private readonly venueAt: VenueLookup,
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
        summary: 'One community event, and the venue it is held at',
        params: EventParams,
        responses: {
          200: {description: 'The event.', schema: EventPageResponse},
        },
      },
      async (req, res) => {
        const event = await this.pages.event(req.params.id);
        if (event === null) throw unreachable();
        if (!event) throw notListed();
        // The venues failing leaves the event's page without its venue.
        const venue = await this.venueAt(event).catch(error => {
          console.error(
            `Events: finding event ${event.id}'s venue failed`,
            error,
          );
          return null;
        });
        res.set('Cache-Control', 'public, max-age=60').json({event, venue});
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/events/discord',
        summary: 'Share an event in the Everise Discord',
        auth: this.auth.required,
        body: NewEventDiscordShare,
        responses: {
          202: {
            description: 'Sent to the channel.',
            schema: EventDiscordShareResponse,
          },
        },
      },
      async (req, res) => {
        await this.shares.toDiscord(
          req.user!,
          req.body.eventId,
          req.body.comment,
        );
        res.status(StatusCodes.ACCEPTED).json({shared: true});
      },
    );

    return router;
  }
}

export {EventsRouter};
