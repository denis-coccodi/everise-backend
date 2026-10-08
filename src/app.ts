import cookieParser from 'cookie-parser';
import {AppOptions} from './app-options';
import cors from 'cors';
import express from 'express';
import {AdminRouter, CloudflareStagingAccess, MemberDeletion} from './admin';
import {
  ArticlesRouter,
  ArticlesService,
  CommentsRouter,
  CommentsService,
} from './articles';
import {config} from './config';
import {Db} from './db';
import {
  DutiesRouter,
  DutiesService,
  HttpGet,
  ImagesService,
  XivApiClient,
} from './duties';
import {emailSenderFor} from './email';
import {docsRouter} from './api';
import {errorHandler} from './error-handler';
import {MemoryFileStore, UploadStorage} from './files';
import {LiveFeed, noLiveFeed} from './live/live-feed';
import {Auth} from './middleware';
import {
  PartyFinderBoard,
  PartyFinderReader,
  PartyFinderRouter,
} from './party-finder';
import {
  PartyFinderSharesRouter,
  PartyFinderSharesService,
} from './party-finder-shares';
import {ProfilesRouter, ProfilesService} from './profiles';
import {SitemapRouter} from './sitemap';
import {TurnstileVerifier} from './turnstile';
import {RoulettePostsRouter, RoulettePostsService} from './roulette-posts';
import {SocialLoginRouter} from './social-login';
import {GifSearch, MediaRouter, MediaService} from './media';
import {DiscordAnnouncer, DiscordRouter, DiscordWidgetReader} from './discord';
import {
  EmailConfirmation,
  JWTService,
  ProfileImagesService,
  TataruAccount,
  UsersRouter,
  UsersService,
} from './users';
import {
  CharactersService,
  WakingSandsRouter,
  WakingSandsService,
} from './waking-sands';

// httpGet is how the app reaches XIVAPI and now is its clock; tests pass fakes.
function createApp(
  db: Db,
  httpGet: HttpGet = url => fetch(url),
  now: () => Date = () => new Date(),
  liveFeed: LiveFeed = noLiveFeed,
  {
    fileStore = new MemoryFileStore(),
    loadBundledPicture = async () => undefined,
    stagingAccess = new CloudflareStagingAccess(config.stagingAccess),
    socialLogin = {settings: config.socialLogin},
    discord = config.discord,
    gifSearch = {apiKey: config.giphyApiKey},
    emailSender = emailSenderFor(config.email.resendApiKey, config.email.from),
    wakingSands = {},
    partyFinder = new PartyFinderBoard(url => fetch(url), now),
    turnstile = config.turnstile,
    uploadStorageBytes = config.uploadStorageBytes,
  }: AppOptions = {},
) {
  const usersService = new UsersService(db);

  const jwtService = new JWTService(usersService, config.jwt.secretKey, {
    issuer: config.jwt.issuer,
    secondsToExpiration: config.jwt.secondsToExpiration,
  });

  const profilesService = new ProfilesService(db, usersService);

  const uploadStorage = new UploadStorage(db, uploadStorageBytes);

  const mediaService = new MediaService(db, fileStore, uploadStorage, now);

  // The Everise Discord channel: only what members choose to share.
  const discordAnnouncer = new DiscordAnnouncer(
    discord.webhookUrl,
    config.baseUrl,
    discord.fetch,
  );

  const articlesService = new ArticlesService(
    db,
    usersService,
    profilesService,
    liveFeed,
    mediaService,
    discordAnnouncer,
  );
  const commentsService = new CommentsService(
    db,
    articlesService,
    usersService,
    mediaService,
  );

  const auth = new Auth(jwtService);

  const profileImagesService = new ProfileImagesService(
    db,
    fileStore,
    uploadStorage,
  );

  const tataru = new TataruAccount(
    usersService,
    profileImagesService,
    loadBundledPicture,
  );

  const emailConfirmation = new EmailConfirmation(
    db,
    usersService,
    emailSender,
    config.baseUrl,
    now,
  );

  const usersRouter = new UsersRouter(
    auth,
    usersService,
    jwtService,
    profileImagesService,
    emailConfirmation,
    new TurnstileVerifier(
      turnstile.secretKey,
      turnstile.hostnames ?? config.turnstile.hostnames,
      turnstile.fetch,
    ),
  ).router;

  const socialLoginRouter = new SocialLoginRouter(
    usersService,
    jwtService,
    socialLogin.settings,
    config.baseUrl,
    socialLogin.fetch,
  ).router;

  const discordRouter = new DiscordRouter(
    auth,
    new DiscordWidgetReader(discord.guildId, now, discord.fetch),
    discordAnnouncer.available,
  ).router;

  const mediaRouter = new MediaRouter(
    auth,
    mediaService,
    new GifSearch(gifSearch.apiKey, gifSearch.fetch),
  ).router;

  // The Waking Sands characters, as admins edited them.
  const charactersService = new CharactersService(
    db,
    usersService,
    profileImagesService,
    tataru,
    config.baseUrl,
  );

  const adminRouter = new AdminRouter(
    auth,
    usersService,
    profileImagesService,
    tataru,
    stagingAccess,
    new MemberDeletion(db, usersService, profileImagesService, mediaService),
    charactersService,
  ).router;

  const profilesRouter = new ProfilesRouter(auth, usersService, profilesService)
    .router;

  const articlesRouter = new ArticlesRouter(
    auth,
    articlesService,
    usersService,
    profilesService,
  ).router;
  const commentsRouter = new CommentsRouter(
    auth,
    articlesService,
    commentsService,
    profilesService,
  ).router;

  const xivApiClient = new XivApiClient(httpGet);

  const imagesService = new ImagesService(db, xivApiClient);

  const dutiesService = new DutiesService(db, xivApiClient, imagesService, now);

  const dutiesRouter = new DutiesRouter(
    dutiesService,
    imagesService,
    config.dutiesRefreshKey,
  ).router;

  const partyFinderReader = new PartyFinderReader(
    partyFinder,
    () => dutiesService.dutiesByName(),
    now,
  );

  const partyFinderSharesRouter = new PartyFinderSharesRouter(
    auth,
    new PartyFinderSharesService(
      db,
      partyFinderReader,
      articlesService,
      profilesService,
      discordAnnouncer,
      now,
    ),
    profilesService,
  ).router;

  const roulettePostsRouter = new RoulettePostsRouter(
    auth,
    new RoulettePostsService(db, dutiesService, articlesService, tataru, now),
    profilesService,
  ).router;

  const wakingSandsRouter = new WakingSandsRouter(
    auth,
    new WakingSandsService(
      db,
      wakingSands.model,
      charactersService,
      liveFeed,
      now,
      wakingSands.dailyNeurons ?? config.wakingSandsDailyNeurons,
    ),
    loadBundledPicture,
  ).router;

  const app = express();

  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );

  app.use(express.json());
  app.use(cookieParser());

  // Files under public/ (e.g. /assets/images/*) are served by Cloudflare's
  // static assets before a request ever reaches this app.

  app.use('/api', usersRouter);

  app.use('/api', socialLoginRouter);

  app.use('/api', discordRouter);
  app.use('/api', new PartyFinderRouter(partyFinderReader).router);
  app.use('/api', partyFinderSharesRouter);
  app.use('/api', mediaRouter);

  app.use('/api', profilesRouter);

  app.use('/api', articlesRouter);

  app.use('/api', commentsRouter);

  app.use('/api', dutiesRouter);

  app.use('/api', roulettePostsRouter);

  app.use('/api', wakingSandsRouter);

  app.use('/api', adminRouter);

  app.use('/api', new SitemapRouter(db).router);

  // The API's description, built from the routes above.
  app.use('/api', docsRouter());

  app.use(
    async (
      err: Error,
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction,
    ) => {
      await errorHandler.handleError(err, res);
    },
  );

  return app;
}

export {AppOptions, createApp};
