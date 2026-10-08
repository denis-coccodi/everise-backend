import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {ArticleDto, ArticleResponse} from '../articles';
import {Auth} from '../middleware';
import {ProfilesService} from '../profiles';
import {NewRouletteResult} from './roulette-post-schemas';
import {RoulettePostsService} from './roulette-posts-service';

// Posts an accepted roulette result to the feeds. Open to guests (Tataru
// posts for them), but only ever as a result card the backend builds itself:
// no free text from guests, and a limit on how often anyone can post.
class RoulettePostsRouter {
  constructor(
    private readonly auth: Auth,
    private readonly roulettePostsService: RoulettePostsService,
    private readonly profilesService: ProfilesService,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'post',
        path: '/roulette-results',
        summary: 'Post a roulette result to the feeds (guests too)',
        auth: this.auth.optional,
        body: NewRouletteResult,
        responses: {
          201: {description: 'The post.', schema: ArticleResponse},
        },
      },
      async (req, res) => {
        const article = await this.roulettePostsService.post(
          req.body.result,
          req.user,
          req.body.comment,
          // Cloudflare's client address; one value for local runs.
          req.header('cf-connecting-ip') ?? 'local',
          req.body.shareToDiscord,
        );
        const author = await this.profilesService.getProfile(article.authorId);
        res
          .status(StatusCodes.CREATED)
          .json(new ArticleDto(article, false, author));
      },
    );

    return router;
  }
}

export {RoulettePostsRouter};
