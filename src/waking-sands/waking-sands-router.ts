import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {NotFoundError, UpstreamError} from '../errors';
import {Auth} from '../middleware';
import {LoadBundledPicture} from '../users';
import {characterById} from './characters';
import {
  CharacterParams,
  MAX_LINE_LENGTH,
  NewSandsLine,
  PresentResponse,
  SandsLineResponse,
  SandsRoom,
} from './waking-sands-schemas';
import {MAX_PRESENT, WakingSandsService} from './waking-sands-service';

// A picture can change with a deploy, so it's cached for a day, not for good.
const PICTURE_CACHE_CONTROL = 'public, max-age=86400';

// The Waking Sands: one room where members talk with FINAL FANTASY XIV
// characters, and each other. Anyone can watch; talking and bringing
// characters in needs an account, so the day's free AI budget is shared
// fairly among members. Lines arrive live over GET /api/live.
class WakingSandsRouter {
  constructor(
    private readonly auth: Auth,
    private readonly wakingSands: WakingSandsService,
    private readonly loadBundledPicture: LoadBundledPicture,
  ) {}

  get router() {
    const router = express.Router();
    const present = {
      200: {description: "Who's in the room now.", schema: PresentResponse},
    };

    // The room: the characters, who's in it, and the day's lines.
    route(
      router,
      {
        method: 'get',
        path: '/waking-sands/room',
        summary: "The room: its characters, who's in, and the day's lines",
        responses: {200: {description: 'The room.', schema: SandsRoom}},
      },
      async (_req, res) => {
        res.json({
          ...(await this.wakingSands.room()),
          limits: {maxPresent: MAX_PRESENT, maxLineLength: MAX_LINE_LENGTH},
        });
      },
    );

    // Brings a character into the room, for everyone.
    route(
      router,
      {
        method: 'post',
        path: '/waking-sands/room/characters/:id',
        summary: 'Bring a character into the room',
        auth: this.auth.required,
        params: CharacterParams,
        responses: present,
      },
      async (req, res) => {
        this.requireOpen();
        res.json({
          present: await this.wakingSands.invite(req.user!, req.params.id),
        });
      },
    );

    // Sends a character out of the room.
    route(
      router,
      {
        method: 'delete',
        path: '/waking-sands/room/characters/:id',
        summary: 'Send a character out of the room',
        auth: this.auth.required,
        params: CharacterParams,
        responses: present,
      },
      async (req, res) => {
        res.json({
          present: await this.wakingSands.dismiss(req.user!, req.params.id),
        });
      },
    );

    // A member's line. The characters' answers are pushed live as they're
    // written; the request ends when they're done.
    route(
      router,
      {
        method: 'post',
        path: '/waking-sands/room/lines',
        summary: "Say something (the characters' answers arrive live)",
        auth: this.auth.required,
        body: NewSandsLine,
        responses: {
          201: {description: 'The line.', schema: SandsLineResponse},
        },
      },
      async (req, res) => {
        this.requireOpen();
        const line = await this.wakingSands.say(req.user!, req.body.text);
        res.status(StatusCodes.CREATED).json({line});
      },
    );

    // A character's picture, shipped with the backend (public/). Served
    // under /api so the site reaches it through its own address.
    route(
      router,
      {
        method: 'get',
        path: '/waking-sands/characters/:id/picture',
        summary: "A character's picture",
        responses: {
          200: {description: 'The picture.', contentType: 'image/png'},
        },
      },
      async (req, res) => {
        const picture = characterById(req.params.id)?.picture;
        const bytes = picture && (await this.loadBundledPicture(picture));
        if (!bytes) throw new NotFoundError('picture');
        res
          .type('image/png')
          .set('Cache-Control', PICTURE_CACHE_CONTROL)
          .set('X-Content-Type-Options', 'nosniff')
          .send(Buffer.from(bytes));
      },
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
