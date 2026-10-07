import {celebrate, Joi, Segments} from 'celebrate';
import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {InvalidImageError, NotFoundError} from '../errors';
import {Auth} from '../middleware';
import {GifSearch} from './gif-search';
import {MAX_MEDIA_BYTES, MediaService, tooLarge} from './media-service';

// An upload never gets new content, so it can be cached for good.
const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// The raw request body, whatever its content type (the format is read from
// its bytes), up to the size limit.
const readMediaBody: express.RequestHandler = (req, res, next) =>
  express.raw({type: () => true, limit: MAX_MEDIA_BYTES})(req, res, err =>
    next(err?.type === 'entity.too.large' ? tooLarge() : err),
  );

// Images and GIFs for posts and comments: uploads, and a GIF search.
class MediaRouter {
  constructor(
    private readonly auth: Auth,
    private readonly media: MediaService,
    private readonly gifs: GifSearch,
  ) {}

  get router() {
    const router = express.Router();

    // Uploads an image or GIF (the file as the request body); the answer has
    // its address, to put in a post or comment.
    router.post(
      '/media',
      this.auth.requireAuth,
      readMediaBody,
      async (req, res, next) => {
        try {
          if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
            throw new InvalidImageError('Choose an image to upload.');
          }
          const media = await this.media.save(
            req.user!.id,
            new Uint8Array(req.body),
          );
          return res.status(StatusCodes.CREATED).json({media});
        } catch (err) {
          return next(err);
        }
      },
    );

    router.get('/media/:id', async (req, res, next) => {
      try {
        const media = await this.media.get(req.params.id);
        if (!media) {
          throw new NotFoundError('image');
        }
        return (
          res
            .type(media.contentType)
            .set('Cache-Control', MEDIA_CACHE_CONTROL)
            // The type comes from the file's bytes; never let a browser guess
            // another, or run anything inside it.
            .set('X-Content-Type-Options', 'nosniff')
            .set('Content-Security-Policy', "default-src 'none'; sandbox")
            .send(Buffer.from(media.data))
        );
      } catch (err) {
        return next(err);
      }
    });

    // Whether the GIF search is set up, for the site to offer it.
    router.get('/gifs/available', (_req, res) =>
      res.json({available: this.gifs.available}),
    );

    // A page of GIFs from GIPHY: `q` to search (trending without it), and
    // `offset` from the previous page's `next`. Signed in only, like posting.
    router.get(
      '/gifs',
      this.auth.requireAuth,
      celebrate({
        [Segments.QUERY]: Joi.object().keys({
          q: Joi.string().allow('').max(100),
          offset: Joi.number().integer().min(0).max(4999),
        }),
      }),
      async (req, res, next) => {
        try {
          if (!this.gifs.available) {
            throw new NotFoundError('GIF search');
          }
          const query = req.query as Record<string, string | undefined>;
          return res.json(
            await this.gifs.search(query.q ?? '', Number(query.offset ?? 0)),
          );
        } catch (err) {
          return next(err);
        }
      },
    );

    return router;
  }
}

export {MediaRouter};
