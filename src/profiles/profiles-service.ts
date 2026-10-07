import {Db, Doc} from '../db';
import {NotFoundError} from '../errors';
import {UsersService} from '../users';
import {Profile} from './profile';

interface FollowDoc extends Doc {
  followerId: string;
  followeeId: string;
}

class ProfilesService {
  private readonly followsCollection = 'follows';

  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
  ) {}

  async getProfile(userId: string, followerId?: string): Promise<Profile> {
    const user = await this.usersService.getUserById(userId);

    if (!user) {
      throw new NotFoundError(`user "${userId}" not found`);
    }

    let following = false;

    if (followerId) {
      following = await this.isFollowing(followerId, user.id);
    }

    return new Profile(user.id, user.username, following, user.bio, user.image);
  }

  async followUser(followerId: string, followeeId: string): Promise<void> {
    if (followerId === followeeId) {
      throw new RangeError('cannot follow ownself');
    }

    if (await this.isFollowing(followerId, followeeId)) {
      return;
    }

    await this.db.create(this.followsCollection, {
      followerId,
      followeeId,
    });
  }

  async listFollowed(followerId: string): Promise<string[]> {
    const follower = await this.usersService.getUserById(followerId);

    if (!follower) {
      throw new NotFoundError(`follower "${followerId}" not found`);
    }

    const follows = await this.db.find<FollowDoc>(this.followsCollection, {
      where: [{field: 'followerId', op: '==', value: follower.id}],
    });

    return follows.map(follow => follow.followeeId);
  }

  async unfollowUser(followerId: string, followeeId: string): Promise<void> {
    if (followerId === followeeId) {
      throw new RangeError('cannot unfollow ownself');
    }

    if (!(await this.isFollowing(followerId, followeeId))) {
      return;
    }

    const follows = await this.findFollows(followerId, followeeId);

    for (const follow of follows) {
      await this.db.delete(this.followsCollection, follow.id);
    }
  }

  async isFollowing(followerId: string, followeeId: string): Promise<boolean> {
    const follower = await this.usersService.getUserById(followerId);

    if (!follower) {
      throw new NotFoundError(`follower "${followerId}" not found`);
    }

    const followee = await this.usersService.getUserById(followeeId);

    if (!followee) {
      throw new NotFoundError(`followee "${followeeId}" not found`);
    }

    const follows = await this.findFollows(follower.id, followee.id);

    return follows.length > 0;
  }

  private findFollows(followerId: string, followeeId: string) {
    return this.db.find<FollowDoc>(this.followsCollection, {
      where: [
        {field: 'followerId', op: '==', value: followerId},
        {field: 'followeeId', op: '==', value: followeeId},
      ],
    });
  }
}

export {ProfilesService};
