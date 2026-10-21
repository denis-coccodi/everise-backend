import {randomUUID} from 'crypto';
import {Db, Doc, DocData, Write} from '../db';
import {AlreadyExistsError, NotFoundError} from '../errors';
import {UsersService} from '../users';
import {
  DEMO_COMMENTS,
  DEMO_FOLLOWS,
  DEMO_MEMBERS,
  DEMO_POSTS,
} from './demo-content';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// The members' addresses: .invalid never receives mail, and with no
// password or provider nobody can sign in as them.
const DEMO_EMAIL_DOMAIN = 'demo.everise.invalid';

// One document (id `added`) listing every document the demo content added,
// by collection, so it can all be removed again.
const RECORD_COLLECTION = 'demoContent';
const RECORD_ID = 'added';

interface DemoRecordDoc extends Doc {
  ids: Record<string, string[]>;
}

interface DemoContentStatus {
  active: boolean;
  members: number;
  posts: number;
  comments: number;
}

interface NotificationDoc extends Doc {
  userId: string;
}

interface CommentDoc extends Doc {
  articleId: string;
}

interface FollowDoc extends Doc {
  followerId: string;
  followeeId: string;
}

// Adds and removes the demo content (demo-content.ts), and says whether it's
// there, so the site can label it as demo data.
class DemoContentService {
  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
    private readonly now: () => Date,
  ) {}

  async status(): Promise<DemoContentStatus> {
    return statusOf(await this.record());
  }

  // Everything in one batch: one call to the database.
  async add(): Promise<DemoContentStatus> {
    if (await this.record()) {
      throw new AlreadyExistsError(
        'The demo content is already there. Remove it first to add it again.',
      );
    }
    const taken = (
      await Promise.all(
        DEMO_MEMBERS.map(m => this.usersService.getUserByUsername(m.username)),
      )
    ).flatMap(user => (user ? [user.username] : []));
    if (taken.length) {
      throw new AlreadyExistsError(
        `Members already use the demo usernames ${taken.join(', ')}.`,
      );
    }

    const now = this.now().getTime();
    const ids: Record<string, string[]> = {
      users: [],
      articles: [],
      comments: [],
      follows: [],
    };
    const writes: Write[] = [];
    // Dated `at`, never later than now.
    const put = (collection: string, data: DocData, at: number) => {
      const id = randomUUID();
      ids[collection].push(id);
      const createdAt = new Date(Math.min(at, now));
      writes.push({op: 'put', collection, id, data, createdAt});
      return id;
    };

    const members = new Map<string, string>();
    DEMO_MEMBERS.forEach((member, i) => {
      const id = put(
        'users',
        {
          email: `${member.key}@${DEMO_EMAIL_DOMAIN}`,
          username: member.username,
          bio: member.bio,
        },
        now - 35 * DAY + i * HOUR,
      );
      members.set(member.key, id);
    });
    const memberId = (key: string) => members.get(key)!;

    const posts = new Map<string, {id: string; at: number}>();
    for (const post of DEMO_POSTS) {
      const at = now - post.daysAgo * DAY;
      const id = put(
        'articles',
        {
          authorId: memberId(post.author),
          title: post.title,
          description: post.description,
          body: post.body,
          tags: [...post.tags].sort(),
          favoritedBy: post.favouritedBy.map(memberId),
          media: [],
        },
        at,
      );
      posts.set(post.key, {id, at});
    }
    for (const comment of DEMO_COMMENTS) {
      const post = posts.get(comment.post)!;
      put(
        'comments',
        {
          articleId: post.id,
          authorId: memberId(comment.author),
          body: comment.body,
        },
        post.at + comment.hoursAfter * HOUR,
      );
    }
    for (const [follower, followee] of DEMO_FOLLOWS) {
      put(
        'follows',
        {followerId: memberId(follower), followeeId: memberId(followee)},
        now - 20 * DAY,
      );
    }
    writes.push({
      op: 'put',
      collection: RECORD_COLLECTION,
      id: RECORD_ID,
      data: {ids},
      createdAt: new Date(now),
    });

    await this.db.batch(writes);
    return this.status();
  }

  // Removes it all, with what real members added to it since: their
  // comments on demo posts, their follows of demo members, and the demo
  // members' notifications.
  async remove(): Promise<DemoContentStatus> {
    const record = await this.record();
    if (!record) {
      throw new NotFoundError('There is no demo content to remove.');
    }
    const users = new Set(record.ids.users);
    const articles = new Set(record.ids.articles);
    const [comments, follows, notifications] = await Promise.all([
      this.db.find<CommentDoc>('comments'),
      this.db.find<FollowDoc>('follows'),
      Promise.all(
        [...users].map(userId =>
          this.db.find<NotificationDoc>('notifications', {
            where: [{field: 'userId', op: '==', value: userId}],
          }),
        ),
      ),
    ]);
    const remove = (collection: string, id: string): Write => ({
      op: 'delete',
      collection,
      id,
    });
    const added = Object.entries(record.ids).flatMap(([collection, list]) =>
      list.map(id => remove(collection, id)),
    );
    await this.db.batch([
      ...added,
      ...comments
        .filter(c => articles.has(c.articleId))
        .map(c => remove('comments', c.id)),
      ...follows
        .filter(f => users.has(f.followerId) || users.has(f.followeeId))
        .map(f => remove('follows', f.id)),
      ...notifications.flat().map(n => remove('notifications', n.id)),
      remove(RECORD_COLLECTION, RECORD_ID),
    ]);
    return this.status();
  }

  private record() {
    return this.db.get<DemoRecordDoc>(RECORD_COLLECTION, RECORD_ID);
  }
}

function statusOf(record: DemoRecordDoc | undefined): DemoContentStatus {
  return {
    active: Boolean(record),
    members: record?.ids.users.length ?? 0,
    posts: record?.ids.articles.length ?? 0,
    comments: record?.ids.comments.length ?? 0,
  };
}

export {DEMO_EMAIL_DOMAIN, DemoContentService, DemoContentStatus};
