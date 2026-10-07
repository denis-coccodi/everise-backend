import {celebrate, Joi, Segments} from 'celebrate';
import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {ArticleDto} from '../articles';
import {Auth} from '../middleware';
import {ProfilesService} from '../profiles';
import {
  MAX_COMMENT_LENGTH,
  RoulettePostsService,
} from './roulette-posts-service';

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

    router.post(
      '/roulette-results',
      celebrate({
        [Segments.BODY]: Joi.object()
          .keys({
            result: Joi.object()
              .keys({
                type: Joi.string().max(100).required(),
                candidate: Joi.object()
                  .keys({
                    kind: Joi.string().valid('duty', 'roulette').required(),
                    id: Joi.number().integer().min(0).required(),
                  })
                  .required(),
                mode: Joi.string().max(100).required(),
                jobId: Joi.number().integer().min(0),
              })
              .required(),
            comment: Joi.string()
              .allow('')
              .max(MAX_COMMENT_LENGTH)
              .messages({
                'string.max': `Keep the comment to ${MAX_COMMENT_LENGTH} characters.`,
              }),
          })
          .required(),
      }),
      this.auth.optionalAuth,
      async (req, res, next) => {
        try {
          const article = await this.roulettePostsService.post(
            req.body.result,
            req.user,
            req.body.comment,
            // Cloudflare's client address; one value for local runs.
            req.header('cf-connecting-ip') ?? 'local',
          );
          const author = await this.profilesService.getProfile(
            article.authorId,
          );

          return res
            .status(StatusCodes.CREATED)
            .json(new ArticleDto(article, false, author));
        } catch (err) {
          return next(err);
        }
      },
    );

    return router;
  }
}

export {RoulettePostsRouter};
