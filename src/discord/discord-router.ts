import * as express from 'express';
import {route} from '../api';
import {Auth} from '../middleware';
import {DiscordSharingResponse, DiscordWidgetResponse} from './discord-schemas';
import {DiscordWidgetReader} from './discord-widget';

// The Discord server's widget for the home page: who's online, from
// Discord, cached for a minute. Members only: guests don't see who's on the
// server. `widget` is null when it's turned off.
class DiscordRouter {
  constructor(
    private readonly auth: Auth,
    private readonly widget: DiscordWidgetReader,
    // The webhook is set: members may share in the channel.
    private readonly sharing: boolean,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/discord/widget',
        summary: "Who's online on the Discord server",
        auth: this.auth.required,
        responses: {
          200: {description: 'The widget.', schema: DiscordWidgetResponse},
        },
      },
      async (_req, res) => {
        // Private: only a member's browser may keep it, not a shared cache.
        res
          .set('Cache-Control', 'private, max-age=60')
          .json({widget: await this.widget.read()});
      },
    );

    // Whether the site offers "Also share in the Everise Discord" and the
    // Party Finder's "Share to Discord". Open: the forms ask before showing.
    route(
      router,
      {
        method: 'get',
        path: '/discord/sharing',
        summary: 'Whether members can share in the Everise Discord',
        responses: {
          200: {description: 'Whether.', schema: DiscordSharingResponse},
        },
      },
      (_req, res) => {
        res
          .set('Cache-Control', 'public, max-age=3600')
          .json({available: this.sharing});
      },
    );

    return router;
  }
}

export {DiscordRouter};
