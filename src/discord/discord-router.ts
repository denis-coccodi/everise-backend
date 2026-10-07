import * as express from 'express';
import {route} from '../api';
import {Auth} from '../middleware';
import {DiscordWidgetResponse} from './discord-schemas';
import {DiscordWidgetReader} from './discord-widget';

// The Discord server's widget for the home page: who's online, from
// Discord, cached for a minute. Members only: guests don't see who's on the
// server. `widget` is null when it's turned off.
class DiscordRouter {
  constructor(
    private readonly auth: Auth,
    private readonly widget: DiscordWidgetReader,
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

    return router;
  }
}

export {DiscordRouter};
