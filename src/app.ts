import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import {
  AdminRouter,
  CloudflareStagingAccess,
  MemberDeletion,
  StagingAccess,
} from './admin';
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
import {LiveFeed, noLiveFeed} from './live/live-feed';
import {Auth} from './middleware';
import {ProfilesRouter, ProfilesService} from './profiles';
import {RoulettePostsRouter, RoulettePostsService} from './roulette-posts';
import {
  OAuthFetch,
  SocialLoginRouter,
  SocialLoginSettings,
} from './social-login';
import {GifFetch, GifSearch, MediaRouter, MediaService} from './media';
import {
  JWTService,
  LoadBundledPicture,
  ProfileImagesService,
  TataruAccount,
  UsersRouter,
  UsersService,
} from './users';

interface AppOptions {
  // Reads a picture from public/ (the Worker's static assets).
  loadBundledPicture?: LoadBundledPicture;
  // Where staging testers are given access to the staging site.
  stagingAccess?: StagingAccess;
  // Sign-in with Google and Facebook: the apps' settings, and how the app
  // reaches the providers.
  socialLogin?: {settings: SocialLoginSettings; fetch?: OAuthFetch};
  // The GIF search: GIPHY's key, and how the app reaches it.
  gifSearch?: {apiKey?: string; fetch?: GifFetch};
}

// httpGet is how the app reaches XIVAPI and now is its clock; tests pass fakes.
function createApp(
  db: Db,
  httpGet: HttpGet = url => fetch(url),
  now: () => Date = () => new Date(),
  liveFeed: LiveFeed = noLiveFeed,
  {
    loadBundledPicture = async () => undefined,
    stagingAccess = new CloudflareStagingAccess(config.stagingAccess),
    socialLogin = {settings: config.socialLogin},
    gifSearch = {apiKey: config.giphyApiKey},
  }: AppOptions = {}
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
    profilesService,
    liveFeed
  );

  const auth = new Auth(jwtService);

  const profileImagesService = new ProfileImagesService(db);

  const tataru = new TataruAccount(
    usersService,
    profileImagesService,
    loadBundledPicture
  );

  const usersRouter = new UsersRouter(
    auth,
    usersService,
    jwtService,
    profileImagesService
  ).router;

  const socialLoginRouter = new SocialLoginRouter(
    usersService,
    jwtService,
    socialLogin.settings,
    config.baseUrl,
    socialLogin.fetch
  ).router;

  const mediaService = new MediaService(db, now);

  const mediaRouter = new MediaRouter(
    auth,
    mediaService,
    new GifSearch(gifSearch.apiKey, gifSearch.fetch)
  ).router;

  const adminRouter = new AdminRouter(
    auth,
    usersService,
    profileImagesService,
    tataru,
    stagingAccess,
    new MemberDeletion(db, usersService, profileImagesService, mediaService)
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
    new RoulettePostsService(db, dutiesService, articlesService, tataru, now),
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

  app.use('/api', socialLoginRouter);

  app.use('/api', mediaRouter);

  app.use('/api', profilesRouter);

  app.use('/api', articlesRouter);

  app.use('/api', dutiesRouter);

  app.use('/api', roulettePostsRouter);

  app.use('/api', adminRouter);

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

export {AppOptions, createApp};
