import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {NotFoundError, UnauthorizedError} from '../errors';
import {Auth} from '../middleware';
import {ProfilesService} from '../profiles';
import {User, UsersService} from '../users';
import {Article} from './article';
import {ArticleDto} from './article-dto';
import {
  ArticleResponse,
  ArticlesQuery,
  ArticlesResponse,
  ArticleUpdate,
  FeedQuery,
  NewArticle,
  TagsResponse,
} from './article-schemas';
import {ArticlesService} from './articles-service';

const noContent = {204: {description: 'Done.'}};

class ArticlesRouter {
  constructor(
    private readonly auth: Auth,
    private readonly articlesService: ArticlesService,
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
  ) {}

  // A post as `viewer` sees it: whether they favorited it, and whether they
  // follow its author.
  private async articleView(article: Article, viewer?: User) {
    const favorited = viewer ? article.favoritedBy.includes(viewer.id) : false;
    return this.articleDto(article, favorited, viewer?.id);
  }

  private async articleDto(
    article: Article,
    favorited: boolean,
    followerId?: string,
  ) {
    const author = await this.profilesService.getProfile(
      article.authorId,
      followerId,
    );
    return new ArticleDto(article, favorited, author);
  }

  private async articlesBody(articles: Article[], viewer?: User) {
    const views = await Promise.all(
      articles.map(article => this.articleView(article, viewer)),
    );
    return {
      articles: views.map(view => view.article),
      articlesCount: views.length,
    };
  }

  // The member an `author` or `favorited` filter names, by id or username.
  private async memberId(idOrName: string | undefined, what: string) {
    if (!idOrName) return undefined;
    const member = await this.usersService.findUser(idOrName);
    if (!member) throw new NotFoundError(`${what} "${idOrName}" not found`);
    return member.id;
  }

  // The post, when `user` wrote it.
  private async ownArticle(id: string, user: User, action: string) {
    const article = await this.articlesService.requireArticle(id);
    if (user.id !== article.authorId) {
      throw new UnauthorizedError(
        `user ${user.id} unauthorized to ${action} article ${article.id}`,
      );
    }
    return article;
  }

  get router() {
    const router = express.Router();
    const post = {200: {description: 'The post.', schema: ArticleResponse}};
    const page = {200: {description: 'A page.', schema: ArticlesResponse}};

    route(
      router,
      {
        method: 'post',
        path: '/articles',
        summary: 'Write a post',
        auth: this.auth.required,
        body: NewArticle,
        responses: {201: {description: 'The post.', schema: ArticleResponse}},
      },
      async (req, res) => {
        const {title, description, body, tagList, media} = req.body.article;
        const article = await this.articlesService.createArticle(req.user!.id, {
          title,
          description,
          body,
          tags: tagList,
          media,
        });
        res
          .status(StatusCodes.CREATED)
          .json(await this.articleDto(article, false));
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/articles/feed',
        summary: 'Posts by the members the user follows',
        auth: this.auth.required,
        query: FeedQuery,
        responses: page,
      },
      async (req, res) => {
        const articles = await this.articlesService.listUserFeed({
          userId: req.user!.id,
          ...req.query,
        });
        res.json(await this.articlesBody(articles, req.user));
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/articles',
        summary: 'Posts, newest first, optionally filtered',
        auth: this.auth.optional,
        query: ArticlesQuery,
        responses: page,
      },
      async (req, res) => {
        const {tag, author, favorited, limit, offset} = req.query;
        const articles = await this.articlesService.listArticles({
          orderBy: [{field: 'createdAt', direction: 'desc'}],
          tag,
          authorId: await this.memberId(author, 'author'),
          favoritedByUserId: await this.memberId(favorited, 'user'),
          limit,
          offset,
        });
        res.json(await this.articlesBody(articles, req.user));
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/articles/:id',
        summary: 'A post',
        auth: this.auth.optional,
        responses: post,
      },
      async (req, res) => {
        const article = await this.articlesService.requireArticle(
          req.params.id,
        );
        res.json(await this.articleView(article, req.user));
      },
    );

    route(
      router,
      {
        method: 'put',
        path: '/articles/:id',
        summary: 'Change a post (its author only)',
        auth: this.auth.required,
        body: ArticleUpdate,
        responses: post,
      },
      async (req, res) => {
        const article = await this.ownArticle(
          req.params.id,
          req.user!,
          'update',
        );
        const {title, description, body, tagList, media} = req.body.article;
        const updated = await this.articlesService.updateArticle(article.id, {
          title,
          description,
          body,
          tags: tagList,
          media,
        });
        res.json(await this.articleDto(updated, false));
      },
    );

    route(
      router,
      {
        method: 'delete',
        path: '/articles/:id',
        summary: 'Delete a post (its author only)',
        auth: this.auth.required,
        responses: noContent,
      },
      async (req, res) => {
        const article = await this.ownArticle(
          req.params.id,
          req.user!,
          'delete',
        );
        await this.articlesService.deleteArticle(article.id);
        res.sendStatus(StatusCodes.NO_CONTENT);
      },
    );

    for (const favorite of [true, false]) {
      route(
        router,
        {
          method: favorite ? 'post' : 'delete',
          path: '/articles/:id/favorite',
          summary: favorite ? 'Favorite a post' : 'Unfavorite a post',
          auth: this.auth.required,
          responses: post,
        },
        async (req, res) => {
          const {id} = req.params;
          if (favorite) {
            await this.articlesService.favoriteArticle(id, req.user!.id);
          } else {
            await this.articlesService.unfavoriteArticle(id, req.user!.id);
          }
          const article = await this.articlesService.requireArticle(id);
          res.json(await this.articleDto(article, favorite));
        },
      );
    }

    route(
      router,
      {
        method: 'get',
        path: '/tags',
        summary: 'The tags in use',
        tag: 'articles',
        responses: {200: {description: 'The tags.', schema: TagsResponse}},
      },
      async (_req, res) => {
        res.json({tags: await this.articlesService.listTags()});
      },
    );

    return router;
  }
}

export {ArticlesRouter};
