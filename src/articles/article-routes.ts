import {Db} from '../db';
import {DiscordAnnouncer} from '../discord';
import {Auth} from '../middleware';
import {NotificationsService} from '../notifications';
import {ProfilesService} from '../profiles';
import {UsersService} from '../users';
import {ArticleSharesRouter} from './article-shares-router';
import {ArticleSharesService} from './article-shares-service';
import {ArticlesRouter} from './articles-router';
import {ArticlesService} from './articles-service';
import {CommentsRouter} from './comments-router';
import {CommentsService} from './comments-service';

// The posts' routers, put together for the app (src/app.ts): the posts,
// sharing a post in the Everise Discord after it was posted, and the
// comments. The services are made in the app, since other features use
// them too.
interface ArticleParts {
  auth: Auth;
  db: Db;
  articlesService: ArticlesService;
  commentsService: CommentsService;
  usersService: UsersService;
  profilesService: ProfilesService;
  notifications: NotificationsService;
  discord: DiscordAnnouncer;
  now: () => Date;
}

function articleRoutes(parts: ArticleParts) {
  const {auth, articlesService, profilesService, notifications} = parts;
  return [
    new ArticlesRouter(
      auth,
      articlesService,
      parts.usersService,
      profilesService,
      notifications,
    ).router,
    new ArticleSharesRouter(
      auth,
      new ArticleSharesService(
        parts.db,
        articlesService,
        profilesService,
        parts.discord,
        parts.now,
      ),
    ).router,
    new CommentsRouter(
      auth,
      articlesService,
      parts.commentsService,
      profilesService,
      notifications,
    ).router,
  ];
}

export {articleRoutes};
