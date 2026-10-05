import * as express from 'express';
import {DiscordWidgetReader} from './discord-widget';

// The Discord server's widget for the home page: who's online, from
// Discord, cached for a minute. `widget` is null when it's turned off.
class DiscordRouter {
  constructor(private readonly widget: DiscordWidgetReader) {}

  get router() {
    const router = express.Router();

    router.get('/discord/widget', async (_req, res, next) => {
      try {
        return res
          .set('Cache-Control', 'public, max-age=60')
          .json({widget: await this.widget.read()});
      } catch (err) {
        return next(err);
      }
    });

    return router;
  }
}

export {DiscordRouter};
