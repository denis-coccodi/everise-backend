import {celebrate, Joi, Segments} from 'celebrate';
import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {NotFoundError, UpstreamError} from '../errors';
import {Auth, routeParam} from '../middleware';
import {LoadBundledPicture} from '../users';
import {CHARACTERS, characterById} from './characters';
import {WakingSandsService} from './waking-sands-service';

const CHARACTER_IDS = CHARACTERS.map(character => character.id);
const MAX_LINE_LENGTH = 1000;
// A picture can change with a deploy, so it's cached for a day, not for good.
const PICTURE_CACHE_CONTROL = 'public, max-age=86400';

const characterParam = celebrate({
  [Segments.PARAMS]: Joi.object().keys({
    id: Joi.string()
      .valid(...CHARACTER_IDS)
      .required(),
  }),
});

// The Waking Sands: one room where members talk with FINAL FANTASY XIV
// characters, and each other. Anyone can watch; talking and bringing
// characters in needs an account, so the day's free AI budget is shared
// fairly among members. Lines arrive live over GET /api/live.
class WakingSandsRouter {
  constructor(
    private readonly auth: Auth,
    private readonly wakingSands: WakingSandsService,
    private readonly loadBundledPicture: LoadBundledPicture
  ) {}

  get router() {
    const router = express.Router();

    // The room: the characters, who's in it, and the day's lines.
    router.get('/waking-sands/room', async (_req, res, next) => {
      try {
        return res.json(await this.wakingSands.room());
      } catch (err) {
        return next(err);
      }
    });

    // Brings a character into the room, for everyone.
    router.post(
      '/waking-sands/room/characters/:id',
      this.auth.requireAuth,
      characterParam,
      async (req, res, next) => {
        try {
          this.requireOpen();
          const present = await this.wakingSands.invite(
            req.user!,
            routeParam(req, 'id')
          );
          return res.json({present});
        } catch (err) {
          return next(err);
        }
      }
    );

    // Sends a character out of the room.
    router.delete(
      '/waking-sands/room/characters/:id',
      this.auth.requireAuth,
      characterParam,
      async (req, res, next) => {
        try {
          const present = await this.wakingSands.dismiss(
            req.user!,
            routeParam(req, 'id')
          );
          return res.json({present});
        } catch (err) {
          return next(err);
        }
      }
    );

    // A member's line. The characters' answers are pushed live as they're
    // written; the request ends when they're done.
    router.post(
      '/waking-sands/room/lines',
      this.auth.requireAuth,
      celebrate({
        [Segments.BODY]: Joi.object()
          .keys({
            text: Joi.string().trim().min(1).max(MAX_LINE_LENGTH).required(),
          })
          .required(),
      }),
      async (req, res, next) => {
        try {
          this.requireOpen();
          const line = await this.wakingSands.say(req.user!, req.body.text);
          return res.status(StatusCodes.CREATED).json({line});
        } catch (err) {
          return next(err);
        }
      }
    );

    // A character's picture, shipped with the backend (public/). Served
    // under /api so the site reaches it through its own address.
    router.get(
      '/waking-sands/characters/:id/picture',
      async (req, res, next) => {
        try {
          const picture = characterById(routeParam(req, 'id'))?.picture;
          const bytes = picture && (await this.loadBundledPicture(picture));
          if (!bytes) {
            throw new NotFoundError('picture');
          }
          return res
            .type('image/png')
            .set('Cache-Control', PICTURE_CACHE_CONTROL)
            .set('X-Content-Type-Options', 'nosniff')
            .send(Buffer.from(bytes));
        } catch (err) {
          return next(err);
        }
      }
    );

    return router;
  }

  private requireOpen() {
    if (!this.wakingSands.available) {
      throw new UpstreamError("The Waking Sands isn't open yet.");
    }
  }
}

export {WakingSandsRouter};
