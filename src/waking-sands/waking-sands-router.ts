import {celebrate, Joi, Segments} from 'celebrate';
import * as express from 'express';
import {NotFoundError, UpstreamError} from '../errors';
import {Auth} from '../middleware';
import {LoadBundledPicture} from '../users';
import {CHARACTERS, characterById} from './characters';
import {WakingSandsService} from './waking-sands-service';

const CHARACTER_IDS = CHARACTERS.map(character => character.id);
const MAX_LINES = 40;
const MAX_LINE_LENGTH = 1000;
// A picture can change with a deploy, so it's cached for a day, not for good.
const PICTURE_CACHE_CONTROL = 'public, max-age=86400';

// The Waking Sands: chatting with FINAL FANTASY XIV characters. Signed in
// only, so the day's free AI budget is shared fairly among members.
class WakingSandsRouter {
  constructor(
    private readonly auth: Auth,
    private readonly wakingSands: WakingSandsService,
    private readonly loadBundledPicture: LoadBundledPicture
  ) {}

  get router() {
    const router = express.Router();

    // Who can join a conversation, and whether the chat is set up at all.
    router.get('/waking-sands/characters', async (_req, res, next) => {
      try {
        return res.json({
          available: this.wakingSands.available,
          characters: await this.wakingSands.characters(),
        });
      } catch (err) {
        return next(err);
      }
    });

    // A character's picture, shipped with the backend (public/). Served
    // under /api so the site reaches it through its own address.
    router.get(
      '/waking-sands/characters/:id/picture',
      async (req, res, next) => {
        try {
          const picture = characterById(req.params.id)?.picture;
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

    // The characters' answers to the member's latest line. `characters` are
    // who's in the conversation, answering in that order; `lines` its latest
    // lines, oldest first, ending with the member's.
    router.post(
      '/waking-sands/replies',
      this.auth.requireAuth,
      celebrate({
        [Segments.BODY]: Joi.object()
          .keys({
            characters: Joi.array()
              .items(Joi.string().valid(...CHARACTER_IDS))
              .min(1)
              .unique()
              .required(),
            lines: Joi.array()
              .items(
                Joi.object().keys({
                  from: Joi.string()
                    .valid('member', ...CHARACTER_IDS)
                    .required(),
                  text: Joi.string().trim().max(MAX_LINE_LENGTH).required(),
                })
              )
              .min(1)
              .max(MAX_LINES)
              .custom((lines: {from: string}[], helpers) =>
                lines[lines.length - 1].from === 'member'
                  ? lines
                  : helpers.message({
                      custom: 'The last line must be yours.',
                    })
              )
              .required(),
          })
          .required(),
      }),
      async (req, res, next) => {
        try {
          if (!this.wakingSands.available) {
            throw new UpstreamError("The Waking Sands isn't open yet.");
          }
          const replies = await this.wakingSands.reply(
            req.user!,
            req.body.characters,
            req.body.lines
          );
          return res.json({replies});
        } catch (err) {
          return next(err);
        }
      }
    );

    return router;
  }
}

export {WakingSandsRouter};
