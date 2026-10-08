import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import {
  AdminRouter,
  CloudflareStagingAccess,
  MemberDeletion,
  StagingAccess,
} from './admin';
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
import {emailSenderFor, EmailSender} from './email';
import {docsRouter} from './api';
import {errorHandler} from './error-handler';
import {FileStore, MemoryFileStore, UploadStorage} from './files';
import {LiveFeed, noLiveFeed} from './live/live-feed';
import {Auth} from './middleware';
import {
  PartyFinderBoard,
  PartyFinderRouter,
  PartyFinderSource,
} from './party-finder';
import {ProfilesRouter, ProfilesService} from './profiles';
import {SitemapRouter} from './sitemap';
import {TurnstileFetch, TurnstileVerifier} from './turnstile';
import {RoulettePostsRouter, RoulettePostsService} from './roulette-posts';
import {
  OAuthFetch,
  SocialLoginRouter,
  SocialLoginSettings,
} from './social-login';
import {GifFetch, GifSearch, MediaRouter, MediaService} from './media';
import {
  DiscordAnnouncer,
  DiscordFetch,
  DiscordRouter,
  DiscordWidgetReader,
  allFeeds,
} from './discord';
import {
  EmailConfirmation,
  JWTService,
  LoadBundledPicture,
  ProfileImagesService,
  TataruAccount,
  UsersRouter,
  UsersService,
} from './users';
import {
  CharacterModel,
  CharactersService,
  WakingSandsRouter,
  WakingSandsService,
} from './waking-sands';

interface AppOptions {
  // Where uploaded images' bytes are kept (R2 in the Worker; memory without).
  fileStore?: FileStore;
  // Reads a picture from public/ (the Worker's static assets).
  loadBundledPicture?: LoadBundledPicture;
  // Where staging testers are given access to the staging site.
  stagingAccess?: StagingAccess;
  // Sign-in with Google and Facebook: the apps' settings, and how the app
  // reaches the providers.
  socialLogin?: {settings: SocialLoginSettings; fetch?: OAuthFetch};
  // Announcements in a Discord channel and the server's widget.
  discord?: {webhookUrl?: string; guildId?: string; fetch?: DiscordFetch};
  // The GIF search: GIPHY's key, and how the app reaches it.
  gifSearch?: {apiKey?: string; fetch?: GifFetch};
  // Sends the email confirmation links; without one, emails aren't
  // confirmed.
  emailSender?: EmailSender;
  // The Waking Sands: what writes the characters' lines (Workers AI), and
  // the Neurons it may spend a day. Without a model, or with no Neurons,
  // the chat isn't open.
  wakingSands?: {model?: CharacterModel; dailyNeurons?: number};
  // The Party Finder listings (xivpf.com). In the Worker, the Durable Object
  // that reads them; otherwise a board in this process.
  partyFinder?: PartyFinderSource;
  // The bot check (Cloudflare Turnstile): its secret, the site's hostnames,
  // and how the app reaches siteverify. Without a secret, nothing is checked.
  turnstile?: {
    secretKey?: string;
    hostnames?: string[];
    fetch?: TurnstileFetch;
  };
  // The bytes everyone's uploads may keep together.
  uploadStorageBytes?: number;
}

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

  const articlesService = new ArticlesService(
    db,
    usersService,
    profilesService,
    allFeeds(
      liveFeed,
      new DiscordAnnouncer(discord.webhookUrl, config.baseUrl, discord.fetch),
    ),
    mediaService,
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
  app.use(
    '/api',
    new PartyFinderRouter(partyFinder, () => dutiesService.dutiesByName(), now)
      .router,
  );
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
