import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {EventsAtVenues} from '../events';
import {Auth} from '../middleware';
import {
  NewVenueDiscordShare,
  VenueDiscordShareResponse,
  VenuePageResponse,
  VenueParams,
} from './venue-page-schemas';
import {VenuePages} from './venue-pages';
import {
  VenueSharesService,
  notListed,
  unreachable,
} from './venue-shares-service';

// A venue's own page on the site (open to everyone), with the week's events
// surely held there, and sharing it in the Everise Discord (for members),
// which links back to that page.
class VenuePagesRouter {
  constructor(
    private readonly auth: Auth,
    private readonly pages: VenuePages,
    private readonly shares: VenueSharesService,
    private readonly events: EventsAtVenues,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/venues/:id',
        summary: "One venue, with its regular openings and this week's events",
        params: VenueParams,
        responses: {
          200: {description: 'The venue.', schema: VenuePageResponse},
        },
      },
      async (req, res) => {
        const venue = await this.pages.venue(req.params.id);
        if (venue === null) throw unreachable();
        if (!venue) throw notListed();
        const place = this.pages.place(req.params.id);
        const events = place ? await this.events.at(place) : [];
        res.set('Cache-Control', 'public, max-age=60').json({venue, events});
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/venues/discord',
        summary: 'Share a venue in the Everise Discord',
        auth: this.auth.required,
        body: NewVenueDiscordShare,
        responses: {
          202: {
            description: 'Sent to the channel.',
            schema: VenueDiscordShareResponse,
          },
        },
      },
      async (req, res) => {
        await this.shares.toDiscord(
          req.user!,
          req.body.venueId,
          req.body.comment,
        );
        res.status(StatusCodes.ACCEPTED).json({shared: true});
      },
    );

    return router;
  }
}

export {VenuePagesRouter};
