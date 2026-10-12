import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {Auth} from '../middleware';
import {ArticleDiscordShareResponse} from './article-schemas';
import {ArticleSharesService} from './article-shares-service';

// Sharing a post in the Everise Discord after it was posted.
class ArticleSharesRouter {
  constructor(
    private readonly auth: Auth,
    private readonly sharesService: ArticleSharesService,
  ) {}

  get router() {
    const router = express.Router();

    // Its author, or an admin: once a minute per member. 503 where Discord
    // isn't set up (GET /api/discord/sharing says whether it is).
    route(
      router,
      {
        method: 'post',
        path: '/articles/:id/discord',
        summary: 'Share a post in the Everise Discord (its author or an admin)',
        auth: this.auth.required,
        responses: {
          202: {
            description: 'Sent to the channel.',
            schema: ArticleDiscordShareResponse,
          },
        },
      },
      async (req, res) => {
        await this.sharesService.toDiscord(req.user!, req.params.id);
        res.status(StatusCodes.ACCEPTED).json({shared: true});
      },
    );

    return router;
  }
}

export {ArticleSharesRouter};
