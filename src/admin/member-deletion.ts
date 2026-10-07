import {Db, Doc} from '../db';
import {Write} from '../db/db';
import {InvalidRoleError, NotFoundError} from '../errors';
import {MediaService} from '../media';
import {ProfileImagesService, UsersService} from '../users';

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

// What a deletion removed, for the admin's confirmation.
interface DeletedMember {
  username: string;
  wasStagingTester: boolean;
  articles: number;
  comments: number;
}

// Deletes a member and everything they leave behind: their posts (with the
// comments on them), their comments elsewhere, their favourites, follows in
// both directions, uploaded pictures and images, and roulette posting limit. The privacy
// policy promises this. The collections are those the services define.
class MemberDeletion {
  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
    private readonly profileImagesService: ProfileImagesService,
    private readonly mediaService: MediaService,
  ) {}

  async delete(key: string): Promise<DeletedMember> {
    const user = await this.usersService.findUser(key);
    if (!user || user.system) {
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
      ...(await this.profileImagesService.idsOf(user.id)).map(id =>
        remove('profileImages', id),
      ),
      ...(await this.mediaService.deletionsFor(user.id)),
      remove('postLimits', `user-${user.id}`),
      remove('users', user.id),
    ];
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

export {DeletedMember, MemberDeletion};
