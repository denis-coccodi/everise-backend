import {Db} from '../db';
import {NotFoundError} from '../errors';
import {UsersService} from '../users';
import {Article} from './article';
import {ArticleAnnouncer, announceArticle} from './announce-article';
import {ProfilesService} from '../profiles';
import {LiveFeed, noLiveFeed} from '../live/live-feed';
import {attachmentsFromText, cleanAttachment} from '../media/attachments';
import {MediaService} from '../media/media-service';
import {
  ArticleDoc,
  CommentDoc,
  CreateArticleParams,
  ListArticlesParams,
  UpdateArticleParams,
  UserFeedParams,
  tidyTags,
  toArticle,
  uploadsIn,
} from './article-docs';

class ArticlesService {
  private readonly articlesCollection = 'articles';
  private readonly commentsCollection = 'comments';

  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
    private readonly liveFeed: LiveFeed = noLiveFeed,
    private readonly mediaService?: MediaService,
    // The Everise Discord, for posts whose author asks.
    private readonly discord?: ArticleAnnouncer,
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
      tags = tidyTags(params.tags);
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
      ...(params.partyFinder ? {partyFinder: params.partyFinder} : {}),
    };

    const articleDoc = await this.db.create<ArticleDoc>(
      this.articlesCollection,
      articleData,
    );
    await this.mediaService?.claim(authorId, uploadsIn(media));

    await announceArticle(
      this.liveFeed,
      this.profilesService,
      articleDoc,
      params.shareToDiscord ? this.discord : undefined,
    );

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

    const {limit, offset} = params;

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
      followedUserArticles = followedUserArticles.slice(params.offset);
    }

    if (params.limit) {
      followedUserArticles = followedUserArticles.slice(0, params.limit);
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
      articleData.tags = tidyTags(params.tags);
    }

    const updatedDoc = await this.db.update<ArticleDoc>(
      this.articlesCollection,
      articleId,
      {
        title: articleData.title,
        description: articleData.description,
        body: articleData.body,
        tags: articleData.tags,
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

    // In one step: two people favoriting at once both count, and an edit
    // made meanwhile isn't overwritten.
    await this.db.addToSet(
      this.articlesCollection,
      article.id,
      'favoritedBy',
      user.id,
    );
  }

  async unfavoriteArticle(key: string, userId: string): Promise<void> {
    const article = await this.requireArticle(key);

    const user = await this.usersService.getUserById(userId);

    if (!user) {
      throw new NotFoundError(`user "${userId}" not found`);
    }

    await this.db.removeFromSet(
      this.articlesCollection,
      article.id,
      'favoritedBy',
      user.id,
    );
  }
}

export {ArticlesService};
