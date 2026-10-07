import * as express from 'express';
import {route} from '../api';
import {DiscordWidgetResponse} from './discord-schemas';
import {DiscordWidgetReader} from './discord-widget';

// The Discord server's widget for the home page: who's online, from
// Discord, cached for a minute. `widget` is null when it's turned off.
class DiscordRouter {
  constructor(private readonly widget: DiscordWidgetReader) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/discord/widget',
        summary: "Who's online on the Discord server",
        responses: {
          200: {description: 'The widget.', schema: DiscordWidgetResponse},
        },
      },
      async (_req, res) => {
        res
          .set('Cache-Control', 'public, max-age=60')
          .json({widget: await this.widget.read()});
      },
    );

    return router;
  }
}

export {DiscordRouter};
