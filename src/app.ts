import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import {ArticlesRouter, ArticlesService} from './articles';
import {config} from './config';
import {Db} from './db';
import {
  DutiesRouter,
  DutiesService,
  HttpGet,
  ImagesService,
  XivApiClient,
} from './duties';
import {errorHandler} from './error-handler';
import {Auth} from './middleware';
import {ProfilesRouter, ProfilesService} from './profiles';
import {RoulettePostsRouter, RoulettePostsService} from './roulette-posts';
import {
  JWTService,
  ProfileImagesService,
  UsersRouter,
  UsersService,
} from './users';

// httpGet is how the app reaches XIVAPI and now is its clock; tests pass fakes.
function createApp(
  db: Db,
  httpGet: HttpGet = url => fetch(url),
  now: () => Date = () => new Date()
) {
  const usersService = new UsersService(db);

  const jwtService = new JWTService(usersService, config.jwt.secretKey, {
    issuer: config.jwt.issuer,
    secondsToExpiration: config.jwt.secondsToExpiration,
  });

  const profilesService = new ProfilesService(db, usersService);

  const articlesService = new ArticlesService(
    db,
    usersService,
    profilesService
  );

  const auth = new Auth(jwtService);

  const usersRouter = new UsersRouter(
    auth,
    usersService,
    jwtService,
    new ProfileImagesService(db)
  ).router;

  const profilesRouter = new ProfilesRouter(auth, usersService, profilesService)
    .router;

  const articlesRouter = new ArticlesRouter(
    auth,
    articlesService,
    usersService,
    profilesService
  ).router;

  const xivApiClient = new XivApiClient(httpGet);

  const imagesService = new ImagesService(db, xivApiClient);

  const dutiesService = new DutiesService(db, xivApiClient, imagesService, now);

  const dutiesRouter = new DutiesRouter(
    dutiesService,
    imagesService,
    config.dutiesRefreshKey
  ).router;

  const roulettePostsRouter = new RoulettePostsRouter(
    auth,
    new RoulettePostsService(
      db,
      dutiesService,
      articlesService,
      usersService,
      now
    ),
    profilesService
  ).router;

  const app = express();

  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    })
  );

  app.use(express.json());
  app.use(cookieParser());

  // Files under public/ (e.g. /assets/images/*) are served by Cloudflare's
  // static assets before a request ever reaches this app.

  app.use('/api', usersRouter);

  app.use('/api', profilesRouter);

  app.use('/api', articlesRouter);

  app.use('/api', dutiesRouter);

  app.use('/api', roulettePostsRouter);

  app.use(
    async (
      err: Error,
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      await errorHandler.handleError(err, res);
    }
  );

  return app;
}

export {createApp};
