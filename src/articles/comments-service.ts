import {Db} from '../db';
import {NotFoundError} from '../errors';
import {cleanAttachment} from '../media/attachments';
import {MediaService} from '../media/media-service';
import {UsersService} from '../users';
import {
  AttachmentInput,
  CommentDoc,
  ListCommentsParams,
  toComment,
  uploadsIn,
} from './article-docs';
import {ArticlesService} from './articles-service';
import {Comment} from './comment';

// A post's comments: writing, listing and deleting them, with the upload a
// comment may carry.
class CommentsService {
  private readonly commentsCollection = 'comments';

  constructor(
    private readonly db: Db,
    private readonly articles: ArticlesService,
    private readonly usersService: UsersService,
    private readonly mediaService?: MediaService,
  ) {}

  async addComment(
    articleId: string,
    authorId: string,
    body: string,
    attachment?: AttachmentInput,
  ): Promise<Comment> {
    if (!(await this.articles.getArticleById(articleId))) {
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
    const article = await this.articles.requireArticle(key);

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
      const article = await this.articles.requireArticle(params.article);

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
}

export {CommentsService};
