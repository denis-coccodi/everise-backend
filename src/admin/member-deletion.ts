import {Db, Doc} from '../db';
import {InvalidRoleError, NotFoundError} from '../errors';
import {MediaService} from '../media';
import {ProfileImagesService, UsersService} from '../users';
import {DeletedMember} from './admin-model';
import {Write} from '../db/db-model';

interface ArticleDoc extends Doc {
  authorId: string;
  favoritedBy?: string[];
}

interface CommentDoc extends Doc {
  articleId: string;
  authorId: string;
}

interface FollowDoc extends Doc {
  followerId: string;
  followeeId: string;
}

// Deletes a member and everything they leave behind: their posts (with the
// comments on them), their comments elsewhere, their favourites, follows in
// both directions, uploaded pictures and images, roulette posting limit,
// notifications (theirs, and those they caused others) and the Party Finder
// listings they shared, still watched, and the confirmation link or reset
// code waiting in their inbox. The privacy policy promises this. The
// collections are those the services define.
class MemberDeletion {
  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
    private readonly profileImagesService: ProfileImagesService,
    private readonly mediaService: MediaService,
  ) {}

  async delete(key: string): Promise<DeletedMember> {
    const user = await this.usersService.findUser(key);
    if (!user) {
      throw new NotFoundError(`user "${key}" not found`);
    }
    if (user.role === 'admin') {
      throw new InvalidRoleError(
        `${user.username} is an admin. Remove them from the backend's ADMIN_EMAILS setting first.`,
      );
    }

    const [articles, comments, favourites, follows] = await Promise.all([
      this.db.find<ArticleDoc>('articles', {
        where: [{field: 'authorId', op: '==', value: user.id}],
      }),
      this.db.find<CommentDoc>('comments'),
      this.db.find<ArticleDoc>('articles', {
        where: [{field: 'favoritedBy', op: 'array-contains', value: user.id}],
      }),
      this.db.find<FollowDoc>('follows'),
    ]);
    const notifications = (
      await Promise.all(
        ['userId', 'actorId'].map(field =>
          this.db.find<Doc>('notifications', {
            where: [{field, op: '==', value: user.id}],
          }),
        ),
      )
    ).flat();
    const shares = await this.db.find<Doc>('sharedListings', {
      where: [{field: 'sharerId', op: '==', value: user.id}],
    });
    // The link or code waiting in their inbox.
    const emailed = (
      await Promise.all(
        ['emailConfirmations', 'passwordResets'].map(async collection =>
          (
            await this.db.find<Doc>(collection, {
              where: [{field: 'userId', op: '==', value: user.id}],
            })
          ).map(doc => remove(collection, doc.id)),
        ),
      )
    ).flat();

    const [pictures, uploads] = await Promise.all([
      this.profileImagesService.filesOf(user.id),
      this.mediaService.filesOf(user.id),
    ]);
    const ownArticles = new Set(articles.map(a => a.id));
    const goneComments = comments.filter(
      c => c.authorId === user.id || ownArticles.has(c.articleId),
    );
    const writes: Write[] = [
      ...articles.map(a => remove('articles', a.id)),
      ...goneComments.map(c => remove('comments', c.id)),
      ...favourites
        .filter(a => !ownArticles.has(a.id))
        .map((a): Write => ({
          op: 'update',
          collection: 'articles',
          id: a.id,
          data: {
            favoritedBy: (a.favoritedBy ?? []).filter(id => id !== user.id),
          },
        })),
      ...follows
        .filter(f => f.followerId === user.id || f.followeeId === user.id)
        .map(f => remove('follows', f.id)),
      ...pictures.map(file => remove('profileImages', file.id)),
      ...uploads.map(file => remove('media', file.id)),
      ...notifications.map(n => remove('notifications', n.id)),
      ...shares.map(share => remove('sharedListings', share.id)),
      ...emailed,
      remove('postLimits', `user-${user.id}`),
      remove('postLimits', `pf-post-${user.id}`),
      remove('postLimits', `pf-discord-${user.id}`),
      remove('users', user.id),
    ];
    // The files first: if the database step fails, a retry finds the
    // documents and finishes.
    await this.profileImagesService.deleteFiles(pictures);
    await this.mediaService.deleteFiles(uploads);
    await this.db.batch(writes);

    return {
      username: user.username,
      wasStagingTester: user.role === 'staging-tester',
      articles: articles.length,
      comments: goneComments.filter(c => c.authorId === user.id).length,
    };
  }
}

function remove(collection: string, id: string): Write {
  return {op: 'delete', collection, id};
}

export {MemberDeletion};
