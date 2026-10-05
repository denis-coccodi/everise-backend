import slugify from 'slugify';
import {Joi} from 'celebrate';
import {Db, Doc} from '../db';
import {AlreadyExistsError, NotFoundError} from '../errors';
import {UsersService} from '../users';
import {randomBytes} from 'crypto';
import {Article, RouletteCard} from './article';
import {Comment} from './comment';
import {ProfilesService} from '../profiles';
import {LiveFeed, noLiveFeed} from '../live/live-feed';

interface CreateArticleParams {
  title: string;
  description: string;
  body: string;
  tags?: string[];
  roulette?: RouletteCard;
  // Adds a random suffix to the slug, for titles that repeat (roulette
  // results), instead of rejecting a taken slug.
  uniqueSlug?: boolean;
}

interface ListArticlesParams {
  orderBy: {
    field: 'createdAt';
    direction: 'asc' | 'desc';
  }[];
  tag?: string;
  authorId?: string;
  favoritedByUserId?: string;
  limit?: number;
  offset?: number;
}

interface UserFeedParams {
  userId: string;
  limit?: number;
  offset?: number;
}

interface UpdateArticleParams {
  title?: string;
  description?: string;
  body?: string;
  tags?: string[];
  favoritedBy?: string[];
}

interface ListCommentsParams {
  orderBy: {
    field: 'createdAt';
    direction: 'asc' | 'desc';
  }[];
  slug?: string;
}

interface ArticleDoc extends Doc {
  authorId: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  tags: string[];
  favoritedBy: string[];
  roulette?: RouletteCard;
}

interface CommentDoc extends Doc {
  articleId: string;
  authorId: string;
  body: string;
}

function toArticle(doc: ArticleDoc): Article {
  return new Article(
    doc.id,
    doc.authorId,
    doc.slug,
    doc.title,
    doc.description,
    doc.body,
    doc.tags,
    doc.favoritedBy,
    doc.createdAt,
    doc.updatedAt,
    doc.roulette
  );
}

function toComment(doc: CommentDoc): Comment {
  return new Comment(
    doc.id,
    doc.articleId,
    doc.authorId,
    doc.body,
    doc.createdAt,
    doc.updatedAt
  );
}

class ArticlesService {
  private readonly articlesCollection = 'articles';
  private readonly commentsCollection = 'comments';

  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
    private readonly liveFeed: LiveFeed = noLiveFeed
  ) {}

  async createArticle(
    authorId: string,
    params: CreateArticleParams
  ): Promise<Article> {
    const author = await this.usersService.getUserById(authorId);
    if (!author) {
      throw new NotFoundError(`user "${authorId}" not found`);
    }

    // Suffixed slugs also drop punctuation ("Duty Found: Sastasha" gives
    // duty-found-sastasha-1fb67b60); other slugs keep their old form, so
    // existing links still work.
    const slug = params.uniqueSlug
      ? `${slugify(params.title.toLowerCase(), {strict: true})}-${randomBytes(
          4
        ).toString('hex')}`
      : this.prepareSlug(params.title);

    if (await this.getArticleBySlug(slug)) {
      throw new AlreadyExistsError('"slug" is taken');
    }

    let tags: string[] = [];

    if (params.tags) {
      tags = this.prepareTags(params.tags);
    }

    const articleData = {
      authorId,
      slug,
      title: params.title.trim(),
      description: params.description,
      body: params.body,
      tags,
      favoritedBy: [],
      ...(params.roulette ? {roulette: params.roulette} : {}),
    };

    const articleDoc = await this.db.create<ArticleDoc>(
      this.articlesCollection,
      articleData
    );

    await this.announce(articleDoc, author.username);

    return toArticle(articleDoc);
  }

  async getArticleById(articleId: string): Promise<Article | undefined> {
    const articleDoc = await this.db.get<ArticleDoc>(
      this.articlesCollection,
      articleId
    );

    return articleDoc && toArticle(articleDoc);
  }

  async getArticleBySlug(slug: string): Promise<Article | undefined> {
    const [articleDoc] = await this.db.find<ArticleDoc>(
      this.articlesCollection,
      {
        where: [{field: 'slug', op: '==', value: slug}],
        limit: 1,
      }
    );

    return articleDoc && toArticle(articleDoc);
  }

  async listArticles(params: ListArticlesParams) {
    if (params.orderBy.length === 0) {
      throw new RangeError('"params.orderBy" must have at least 1 element');
    }

    const where = [];

    if (params.tag) {
      where.push({
        field: 'tags',
        op: 'array-contains' as const,
        value: params.tag,
      });
    }

    if (params.authorId) {
      const author = await this.usersService.getUserById(params.authorId);

      if (!author) {
        throw new NotFoundError(`author "${params.authorId}" not found`);
      }

      where.push({field: 'authorId', op: '==' as const, value: author.id});
    }

    if (params.favoritedByUserId) {
      const user = await this.usersService.getUserById(
        params.favoritedByUserId
      );

      if (!user) {
        throw new NotFoundError(`user "${params.favoritedByUserId}" not found`);
      }

      where.push({
        field: 'favoritedBy',
        op: 'array-contains' as const,
        value: user.id,
      });
    }

    let limit;
    if (params.limit) {
      limit = await Joi.number().integer().validateAsync(params.limit);
    }

    let offset;
    if (params.offset) {
      offset = await Joi.number().integer().validateAsync(params.offset);
    }

    const articleDocs = await this.db.find<ArticleDoc>(
      this.articlesCollection,
      {where, orderBy: params.orderBy, limit, offset}
    );

    return articleDocs.map(toArticle);
  }

  async listUserFeed(params: UserFeedParams): Promise<Article[]> {
    const user = await this.usersService.getUserById(params.userId);

    if (!user) {
      throw new NotFoundError(`user "${params.userId}" not found`);
    }

    // TODO(Marcus): optimize this
    const followedUserIds = await this.profilesService.listFollowed(user.id);

    let followedUserArticles = (
      await Promise.all(
        followedUserIds.map(async followedUserId => {
          return await this.listArticles({
            orderBy: [
              {
                field: 'createdAt',
                direction: 'desc',
              },
            ],
            authorId: followedUserId,
          });
        })
      )
    ).flat();

    followedUserArticles.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    if (params.offset) {
      const offset = await Joi.number().integer().validateAsync(params.offset);

      followedUserArticles = followedUserArticles.slice(offset);
    }

    if (params.limit) {
      const limit = await Joi.number().integer().validateAsync(params.limit);

      followedUserArticles = followedUserArticles.slice(0, limit);
    }

    return followedUserArticles;
  }

  async updateArticle(
    articleId: string,
    params: UpdateArticleParams
  ): Promise<Article> {
    const articleData = await this.db.get<ArticleDoc>(
      this.articlesCollection,
      articleId
    );

    if (!articleData) {
      throw new NotFoundError(`article "${articleId}" not found`);
    }

    if (params.title && params.title !== articleData.title) {
      const slug = this.prepareSlug(params.title);

      if (slug !== articleData.slug && (await this.getArticleBySlug(slug))) {
        throw new AlreadyExistsError('"slug" is taken');
      }

      articleData.slug = slug;
      articleData.title = params.title;
    }

    if (params.description && params.description !== articleData.description) {
      articleData.description = params.description;
    }

    if (params.body && params.body !== articleData.body) {
      articleData.body = params.body;
    }

    if (params.tags) {
      articleData.tags = this.prepareTags(params.tags);
    }

    if (params.favoritedBy) {
      articleData.favoritedBy = this.prepareFavoritedBy(params.favoritedBy);
    }

    const updatedDoc = await this.db.update<ArticleDoc>(
      this.articlesCollection,
      articleId,
      {
        slug: articleData.slug,
        title: articleData.title,
        description: articleData.description,
        body: articleData.body,
        tags: articleData.tags,
        favoritedBy: articleData.favoritedBy,
      }
    );

    return toArticle(updatedDoc!);
  }

  async deleteArticleBySlug(slug: string): Promise<void> {
    const article = await this.getArticleBySlug(slug);

    if (!article) {
      throw new NotFoundError(`slug "${slug}" not found`);
    }

    await this.db.delete(this.articlesCollection, article.id);
  }

  async listTags(): Promise<string[]> {
    const articleDocs = await this.db.find<ArticleDoc>(this.articlesCollection);

    const tags = [...new Set(articleDocs.map(doc => doc.tags).flat())];
    tags.sort();
    return tags;
  }

  async favoriteArticleBySlug(slug: string, userId: string): Promise<void> {
    const article = await this.getArticleBySlug(slug);

    if (!article) {
      throw new NotFoundError(`slug "${slug}" not found`);
    }

    const user = await this.usersService.getUserById(userId);

    if (!user) {
      throw new NotFoundError(`user "${userId}" not found`);
    }

    if (article.favoritedBy.includes(user.id)) {
      return;
    }

    await this.updateArticle(article.id, {
      favoritedBy: [...article.favoritedBy, user.id],
    });
  }

  async unfavoriteArticleBySlug(slug: string, userId: string): Promise<void> {
    const article = await this.getArticleBySlug(slug);

    if (!article) {
      throw new NotFoundError(`slug "${slug}" not found`);
    }

    const user = await this.usersService.getUserById(userId);

    if (!user) {
      throw new NotFoundError(`user "${userId}" not found`);
    }

    if (!article.favoritedBy.includes(user.id)) {
      return;
    }

    await this.updateArticle(article.id, {
      favoritedBy: article.favoritedBy.filter(uId => uId !== user.id),
    });
  }

  async addComment(
    articleId: string,
    authorId: string,
    body: string
  ): Promise<Comment> {
    if (!(await this.getArticleById(articleId))) {
      throw new NotFoundError(`article ${articleId} not found`);
    }

    if (!(await this.usersService.getUserById(authorId))) {
      throw new NotFoundError(`user "${authorId}" not found`);
    }

    const commentData = {
      articleId,
      authorId,
      body,
    };

    const commentDoc = await this.db.create<CommentDoc>(
      this.commentsCollection,
      commentData
    );

    return toComment(commentDoc);
  }

  async addCommentBySlug(
    slug: string,
    authorId: string,
    body: string
  ): Promise<Comment> {
    const article = await this.getArticleBySlug(slug);

    if (!article) {
      throw new NotFoundError(`slug "${slug}" not found`);
    }

    return await this.addComment(article.id, authorId, body);
  }

  async getCommentById(commentId: string): Promise<Comment | undefined> {
    const commentDoc = await this.db.get<CommentDoc>(
      this.commentsCollection,
      commentId
    );

    return commentDoc && toComment(commentDoc);
  }

  async listComments(params: ListCommentsParams): Promise<Comment[]> {
    if (params.orderBy.length === 0) {
      throw new RangeError('"params.orderBy" must have at least 1 element');
    }

    const where = [];

    if (params.slug) {
      const article = await this.getArticleBySlug(params.slug);

      if (!article) {
        throw new NotFoundError(`slug "${params.slug}" not found`);
      }

      where.push({field: 'articleId', op: '==' as const, value: article.id});
    }

    const commentDocs = await this.db.find<CommentDoc>(
      this.commentsCollection,
      {where, orderBy: params.orderBy}
    );

    return commentDocs.map(toComment);
  }

  async deleteCommentById(commentId: string) {
    const comment = await this.getCommentById(commentId);

    if (!comment) {
      throw new NotFoundError(`comment "${commentId}" not found`);
    }

    await this.db.delete(this.commentsCollection, comment.id);
  }

  // Tells the live feeds about a new article. The article is saved either
  // way: live updates are a convenience, and pages catch up on reload.
  private async announce(article: ArticleDoc, author: string) {
    try {
      await this.liveFeed.publish({
        type: 'article-created',
        slug: article.slug,
        author,
        tags: article.tags,
      });
    } catch (err) {
      console.error('live update failed', err);
    }
  }

  private prepareSlug(title: string): string {
    return slugify(title.toLowerCase());
  }

  private prepareTags(tags: string[]) {
    tags = [...new Set(tags.map(tag => slugify(tag.toLowerCase())))];
    tags.sort();
    return tags;
  }

  private prepareFavoritedBy(favoritedBy: string[]) {
    favoritedBy = Array.from(new Set(favoritedBy));
    favoritedBy.sort();
    return favoritedBy;
  }
}

export {ArticlesService};
