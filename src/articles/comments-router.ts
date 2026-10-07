import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {NotFoundError, UnauthorizedError} from '../errors';
import {Auth} from '../middleware';
import {ProfilesService, profileView} from '../profiles';
import {CommentResponse, CommentsResponse, NewComment} from './article-schemas';
import {ArticlesService} from './articles-service';
import {Comment} from './comment';

const noContent = {204: {description: 'Done.'}};

// A post's comments: listing, writing and deleting them.
class CommentsRouter {
  constructor(
    private readonly auth: Auth,
    private readonly articlesService: ArticlesService,
    private readonly profilesService: ProfilesService,
  ) {}

  private async commentView(comment: Comment, followerId?: string) {
    const author = await this.profilesService.getProfile(
      comment.authorId,
      followerId,
    );
    return {
      id: comment.id,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      body: comment.body,
      media: comment.media,
      author: profileView(author, author.following),
    };
  }

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/articles/:id/comments',
        summary: "A post's comments, newest first",
        auth: this.auth.optional,
        responses: {
          200: {description: 'The comments.', schema: CommentsResponse},
        },
      },
      async (req, res) => {
        const comments = await this.articlesService.listComments({
          orderBy: [{field: 'createdAt', direction: 'desc'}],
          article: req.params.id,
        });
        res.json({
          comments: await Promise.all(
            comments.map(comment => this.commentView(comment, req.user?.id)),
          ),
        });
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/articles/:id/comments',
        summary: 'Comment on a post',
        auth: this.auth.required,
        body: NewComment,
        responses: {
          201: {description: 'The comment.', schema: CommentResponse},
        },
      },
      async (req, res) => {
        const {body, media} = req.body.comment;
        const comment = await this.articlesService.addCommentTo(
          req.params.id,
          req.user!.id,
          body,
          media?.[0],
        );
        res
          .status(StatusCodes.CREATED)
          .json({comment: await this.commentView(comment)});
      },
    );

    route(
      router,
      {
        method: 'delete',
        path: '/articles/:id/comments/:commentId',
        summary: 'Delete a comment (its author only)',
        auth: this.auth.required,
        responses: noContent,
      },
      async (req, res) => {
        const {id, commentId} = req.params;
        const user = req.user!;
        const comment = await this.articlesService.getCommentById(commentId);
        if (!comment) {
          throw new NotFoundError(`comment "${commentId}" not found`);
        }
        if (user.id !== comment.authorId) {
          throw new UnauthorizedError(
            `user ${user.id} unauthorized to delete comment ${comment.id}`,
          );
        }
        const article = await this.articlesService.requireArticle(id);
        if (comment.articleId !== article.id) {
          throw new NotFoundError(
            `comment "${commentId}" not found in post ${id}`,
          );
        }
        await this.articlesService.deleteCommentById(comment.id);
        res.sendStatus(StatusCodes.NO_CONTENT);
      },
    );

    return router;
  }
}

export {CommentsRouter};
