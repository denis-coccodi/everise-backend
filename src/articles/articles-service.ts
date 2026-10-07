import slugify from 'slugify';
import {Joi} from 'celebrate';
import {Db, Doc} from '../db';
import {NotFoundError} from '../errors';
import {UsersService} from '../users';
import {Article, RouletteCard} from './article';
import {ArticleDto} from './article-dto';
import {Comment} from './comment';
import {ProfilesService} from '../profiles';
import {LiveFeed, noLiveFeed} from '../live/live-feed';
import {
  Attachment,
  attachmentsFromText,
  cleanAttachment,
  currentAttachment,
  uploadIdOf,
} from '../media/attachments';
import {MediaService} from '../media/media-service';

// What the site sends for an attachment; checked and tidied before saving.
type AttachmentInput = Parameters<typeof cleanAttachment>[0];

interface CreateArticleParams {
  title: string;
  description: string;
  body: string;
  tags?: string[];
  roulette?: RouletteCard;
  media?: AttachmentInput[];
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
  media?: AttachmentInput[];
}

interface ListCommentsParams {
  orderBy: {
    field: 'createdAt';
    direction: 'asc' | 'desc';
  }[];
  // The post's id (or an old link's slug).
  article?: string;
}

interface ArticleDoc extends Doc {
  authorId: string;
  // Only on posts made before they had ids in their links, to keep those
  // links working: a slug made from the title.
  slug?: string;
  title: string;
  description: string;
  body: string;
  tags: string[];
  favoritedBy: string[];
  roulette?: RouletteCard;
  // Unset on posts from before attachments: their media is in the text.
  media?: Attachment[];
}

interface CommentDoc extends Doc {
  articleId: string;
  authorId: string;
  body: string;
  media?: Attachment;
}

function toArticle(doc: ArticleDoc): Article {
  // A post from before attachments shows its text's media as attachments,
  // like new posts; the stored post isn't changed.
  const {attachments, text} = doc.media
    ? {attachments: doc.media, text: doc.body}
    : attachmentsFromText(doc.body);
  return new Article(
    doc.id,
    doc.authorId,
    doc.slug,
    doc.title,
    doc.description,
    text,
    doc.tags,
    doc.favoritedBy,
    doc.createdAt,
    doc.updatedAt,
    doc.roulette,
    attachments.map(currentAttachment),
  );
}

function toComment(doc: CommentDoc): Comment {
  return new Comment(
    doc.id,
    doc.articleId,
    doc.authorId,
    doc.body,
    doc.createdAt,
    doc.updatedAt,
    doc.media ? currentAttachment(doc.media) : null,
  );
}

// The site's own uploads among some attachments, by id.
function uploadsIn(media: Attachment[]): string[] {
  return media.flatMap(item => uploadIdOf(item) ?? []);
}

class ArticlesService {
  private readonly articlesCollection = 'articles';
  private readonly commentsCollection = 'comments';

  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
    private readonly liveFeed: LiveFeed = noLiveFeed,
    private readonly mediaService?: MediaService,
  ) {}

  async createArticle(
    authorId: string,
    params: CreateArticleParams,
  ): Promise<Article> {
    const author = await this.usersService.getUserById(authorId);
    if (!author) {
      throw new NotFoundError(`user "${authorId}" not found`);
    }

    let tags: string[] = [];

    if (params.tags) {
      tags = this.prepareTags(params.tags);
    }

    const media = (params.media ?? []).map(cleanAttachment);

    const articleData = {
      authorId,
      title: params.title.trim(),
      description: params.description,
      body: params.body,
      tags,
      favoritedBy: [],
      media,
      ...(params.roulette ? {roulette: params.roulette} : {}),
    };

    const articleDoc = await this.db.create<ArticleDoc>(
      this.articlesCollection,
      articleData,
    );
    await this.mediaService?.claim(authorId, uploadsIn(media));

    await this.announce(articleDoc);

    return toArticle(articleDoc);
  }

  async getArticleById(articleId: string): Promise<Article | undefined> {
    const articleDoc = await this.db.get<ArticleDoc>(
      this.articlesCollection,
      articleId,
    );

    return articleDoc && toArticle(articleDoc);
  }

  // A post by its id, or by the slug in a link from before posts had ids
  // in their links (made from the title), so old links keep working.
  async findArticle(key: string): Promise<Article | undefined> {
    const byId = await this.getArticleById(key);
    if (byId) return byId;

    const [articleDoc] = await this.db.find<ArticleDoc>(
      this.articlesCollection,
      {
        where: [{field: 'slug', op: '==', value: key}],
        limit: 1,
      },
    );

    return articleDoc && toArticle(articleDoc);
  }

  // A post by its id or old slug, or NotFoundError.
  async requireArticle(key: string): Promise<Article> {
    const article = await this.findArticle(key);
    if (!article) {
      throw new NotFoundError(`post "${key}" not found`);
    }
    return article;
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
        params.favoritedByUserId,
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
      {where, orderBy: params.orderBy, limit, offset},
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
        }),
      )
    ).flat();

    followedUserArticles.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
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
    params: UpdateArticleParams,
  ): Promise<Article> {
    const articleData = await this.db.get<ArticleDoc>(
      this.articlesCollection,
      articleId,
    );

    if (!articleData) {
      throw new NotFoundError(`article "${articleId}" not found`);
    }

    // The title can change freely: the post's id, not its title, is in
    // its links.
    if (params.title && params.title !== articleData.title) {
      articleData.title = params.title;
    }

    if (params.description && params.description !== articleData.description) {
      articleData.description = params.description;
    }

    if (params.body !== undefined && params.body !== articleData.body) {
      articleData.body = params.body;
    }

    // The attachments, as the editor now has them. A post from before
    // attachments moves its text's media into them the first time it's
    // saved with them. Uploads no longer used are deleted.
    let media = articleData.media;
    if (params.media) {
      const before = articleData.media ?? toArticle(articleData).media;
      media = params.media.map(cleanAttachment);
      if (!articleData.media) {
        articleData.body = attachmentsFromText(articleData.body).text;
      }
      const kept = new Set(uploadsIn(media));
      await this.mediaService?.release(
        articleData.authorId,
        uploadsIn(before).filter(id => !kept.has(id)),
      );
      await this.mediaService?.claim(articleData.authorId, [...kept]);
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
        title: articleData.title,
        description: articleData.description,
        body: articleData.body,
        tags: articleData.tags,
        favoritedBy: articleData.favoritedBy,
        ...(media ? {media} : {}),
      },
    );

    return toArticle(updatedDoc!);
  }

  // Deletes a post with its comments, and the uploads they used.
  async deleteArticle(key: string): Promise<void> {
    const article = await this.requireArticle(key);
    const comments = await this.db.find<CommentDoc>(this.commentsCollection, {
      where: [{field: 'articleId', op: '==', value: article.id}],
    });

    await this.mediaService?.release(
      article.authorId,
      uploadsIn(article.media),
    );
    for (const comment of comments) {
      if (comment.media) {
        await this.mediaService?.release(
          comment.authorId,
          uploadsIn([comment.media]),
        );
      }
    }
    await this.db.batch([
      ...comments.map(comment => ({
        op: 'delete' as const,
        collection: this.commentsCollection,
        id: comment.id,
      })),
      {op: 'delete', collection: this.articlesCollection, id: article.id},
    ]);
  }

  async listTags(): Promise<string[]> {
    const articleDocs = await this.db.find<ArticleDoc>(this.articlesCollection);

    const tags = [...new Set(articleDocs.map(doc => doc.tags).flat())];
    tags.sort();
    return tags;
  }

  async favoriteArticle(key: string, userId: string): Promise<void> {
    const article = await this.requireArticle(key);

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

  async unfavoriteArticle(key: string, userId: string): Promise<void> {
    const article = await this.requireArticle(key);

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
    body: string,
    attachment?: AttachmentInput,
  ): Promise<Comment> {
    if (!(await this.getArticleById(articleId))) {
      throw new NotFoundError(`article ${articleId} not found`);
    }

    if (!(await this.usersService.getUserById(authorId))) {
      throw new NotFoundError(`user "${authorId}" not found`);
    }

    const media = attachment ? cleanAttachment(attachment) : undefined;
    if (!body.trim() && !media) {
      throw new RangeError('Write a comment, or add an image, GIF or video.');
    }

    const commentData = {
      articleId,
      authorId,
      body,
      ...(media ? {media} : {}),
    };

    const commentDoc = await this.db.create<CommentDoc>(
      this.commentsCollection,
      commentData,
    );
    if (media) {
      await this.mediaService?.claim(authorId, uploadsIn([media]));
    }

    return toComment(commentDoc);
  }

  async addCommentTo(
    key: string,
    authorId: string,
    body: string,
    attachment?: AttachmentInput,
  ): Promise<Comment> {
    const article = await this.requireArticle(key);

    return await this.addComment(article.id, authorId, body, attachment);
  }

  async getCommentById(commentId: string): Promise<Comment | undefined> {
    const commentDoc = await this.db.get<CommentDoc>(
      this.commentsCollection,
      commentId,
    );

    return commentDoc && toComment(commentDoc);
  }

  async listComments(params: ListCommentsParams): Promise<Comment[]> {
    if (params.orderBy.length === 0) {
      throw new RangeError('"params.orderBy" must have at least 1 element');
    }

    const where = [];

    if (params.article) {
      const article = await this.requireArticle(params.article);

      where.push({field: 'articleId', op: '==' as const, value: article.id});
    }

    const commentDocs = await this.db.find<CommentDoc>(
      this.commentsCollection,
      {where, orderBy: params.orderBy},
    );

    return commentDocs.map(toComment);
  }

  async deleteCommentById(commentId: string) {
    const comment = await this.getCommentById(commentId);

    if (!comment) {
      throw new NotFoundError(`comment "${commentId}" not found`);
    }

    if (comment.media) {
      await this.mediaService?.release(
        comment.authorId,
        uploadsIn([comment.media]),
      );
    }
    await this.db.delete(this.commentsCollection, comment.id);
  }

  // Tells the live feeds about a new article. The article is saved either
  // way: live updates are a convenience, and pages catch up on reload.
  private async announce(doc: ArticleDoc) {
    try {
      // As anyone who isn't signed in sees it.
      const author = await this.profilesService.getProfile(doc.authorId);
      await this.liveFeed.publish({
        type: 'article-created',
        article: new ArticleDto(toArticle(doc), false, author).article,
      });
    } catch (err) {
      console.error('live update failed', err);
    }
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
