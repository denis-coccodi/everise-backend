import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {InvalidImageError, NotFoundError} from '../errors';
import {Auth} from '../middleware';
import {GifSearch} from './gif-search';
import {
  GifsAvailableResponse,
  GifsQuery,
  GifsResponse,
  MediaResponse,
} from './media-schemas';
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
    route(
      router,
      {
        method: 'post',
        path: '/media',
        summary: 'Upload an image or GIF (the file as the body)',
        auth: this.auth.required,
        bodyType: 'image',
        responses: {201: {description: 'The upload.', schema: MediaResponse}},
      },
      readMediaBody,
      async (req, res) => {
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          throw new InvalidImageError('Choose an image to upload.');
        }
        const media = await this.media.save(
          req.user!.id,
          new Uint8Array(req.body),
        );
        res.status(StatusCodes.CREATED).json({media});
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/media/:id',
        summary: 'An uploaded image or GIF',
        responses: {200: {description: 'The file.', contentType: 'image/*'}},
      },
      async (req, res) => {
        const media = await this.media.get(req.params.id);
        if (!media) throw new NotFoundError('image');
        res
          .type(media.contentType)
          .set('Cache-Control', MEDIA_CACHE_CONTROL)
          // The type comes from the file's bytes; never let a browser guess
          // another, or run anything inside it.
          .set('X-Content-Type-Options', 'nosniff')
          .set('Content-Security-Policy', "default-src 'none'; sandbox")
          .send(Buffer.from(media.data));
      },
    );

    // Whether the GIF search is set up, for the site to offer it.
    route(
      router,
      {
        method: 'get',
        path: '/gifs/available',
        summary: 'Whether the GIF search is set up',
        responses: {
          200: {description: 'Whether.', schema: GifsAvailableResponse},
        },
      },
      (_req, res) => {
        res.json({available: this.gifs.available});
      },
    );

    // A page of GIFs from GIPHY: `q` to search (trending without it), and
    // `offset` from the previous page's `next`. Signed in only, like posting.
    route(
      router,
      {
        method: 'get',
        path: '/gifs',
        summary: 'Search GIPHY (trending without words)',
        auth: this.auth.required,
        query: GifsQuery,
        responses: {200: {description: 'A page.', schema: GifsResponse}},
      },
      async (req, res) => {
        if (!this.gifs.available) throw new NotFoundError('GIF search');
        res.json(await this.gifs.search(req.query.q, req.query.offset));
      },
    );

    return router;
  }
}

export {MediaRouter};
