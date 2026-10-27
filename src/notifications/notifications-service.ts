import {Db} from '../db';
import {ProfilesService, profileView} from '../profiles';
import {characterOfAuthor} from '../waking-sands';
import {
  LIST_SIZE,
  NOTIFICATIONS,
  excerpt,
  groupKey,
  grouped,
} from './notification-docs';
import {Write} from '../db/db-model';
import {
  NotificationDoc,
  NotificationType,
  SharedListingRef,
} from './notification-model';

// Tells members what happened to their things, as Facebook does: a like
// (favorite) or a comment on one of their posts, a new follower; and the
// site's own news: a Party Finder listing they shared is no longer up, an
// admin changed their role. Nobody hears
// about what they did themselves, and the Waking Sands characters hear
// nothing. Undoing it (an unfavorite, an unfollow, a deleted comment or
// post) takes the notification back. A notification that can't be saved
// never stops what caused it: it's logged and left out.
class NotificationsService {
  constructor(
    private readonly db: Db,
    private readonly profilesService: ProfilesService,
    private readonly now: () => Date,
  ) {}

  favorited(
    article: {id: string; authorId: string; title: string},
    actorId: string,
  ) {
    return this.quietly(() =>
      this.notify(
        `favorite:${article.id}:${actorId}`,
        article.authorId,
        'favorite',
        actorId,
        {articleId: article.id, articleTitle: article.title},
      ),
    );
  }

  unfavorited(articleId: string, actorId: string) {
    return this.quietly(() =>
      this.db.delete(NOTIFICATIONS, `favorite:${articleId}:${actorId}`),
    );
  }

  followed(followeeId: string, followerId: string) {
    return this.quietly(() =>
      this.notify(
        `follow:${followeeId}:${followerId}`,
        followeeId,
        'follow',
        followerId,
        {},
      ),
    );
  }

  unfollowed(followeeId: string, followerId: string) {
    return this.quietly(() =>
      this.db.delete(NOTIFICATIONS, `follow:${followeeId}:${followerId}`),
    );
  }

  commented(
    article: {id: string; authorId: string; title: string},
    comment: {id: string; authorId: string; body: string},
  ) {
    return this.quietly(() =>
      this.notify(
        `comment:${comment.id}`,
        article.authorId,
        'comment',
        comment.authorId,
        {
          articleId: article.id,
          articleTitle: article.title,
          commentId: comment.id,
          commentExcerpt: excerpt(comment.body),
        },
      ),
    );
  }

  // A Party Finder listing the member shared (as a post, or in the
  // Discord) is no longer up. `shareId` names the share: one each.
  listingEnded(
    userId: string,
    shareId: string,
    listing: SharedListingRef,
    articleId?: string,
  ) {
    return this.quietly(() =>
      this.tell(`pf-ended:${shareId}`, userId, 'pf-ended', {
        partyFinder: listing,
        ...(articleId ? {articleId, articleTitle: listing.title} : {}),
      }),
    );
  }

  // An admin changed the member's role: 'staging-tester', or 'user'.
  roleChanged(userId: string, role: string) {
    return this.quietly(() =>
      this.tell(`role:${userId}:${this.now().getTime()}`, userId, 'role', {
        role,
      }),
    );
  }

  commentDeleted(commentId: string) {
    return this.quietly(() =>
      this.db.delete(NOTIFICATIONS, `comment:${commentId}`),
    );
  }

  // A deleted post's notifications go with it: their links lead nowhere.
  articleDeleted(articleId: string) {
    return this.quietly(async () => {
      const docs = await this.db.find<NotificationDoc>(NOTIFICATIONS, {
        where: [{field: 'articleId', op: '==', value: articleId}],
      });
      await this.db.batch(docs.map(doc => remove(doc.id)));
    });
  }

  // A member's list: the newest notifications, grouped, and how many of
  // those they haven't seen (the badge).
  async list(userId: string) {
    const notifications = grouped(await this.docsOf(userId));
    return {
      notifications,
      unseenCount: notifications.filter(group => !group.seen).length,
    };
  }

  async unseenCount(userId: string) {
    return (await this.list(userId)).unseenCount;
  }

  // The member opened the list: the badge starts again from nothing.
  async markSeen(userId: string) {
    const docs = await this.docsOf(userId);
    await this.update(
      docs.filter(doc => !doc.seen),
      {seen: true},
    );
    return this.list(userId);
  }

  // One notification (a group's id from the list) or, without one, all of
  // them, opened.
  async markRead(userId: string, groupId?: string) {
    const docs = await this.docsOf(userId);
    await this.update(
      docs.filter(
        doc =>
          !doc.read && (groupId === undefined || groupKey(doc) === groupId),
      ),
      {seen: true, read: true},
    );
    return this.list(userId);
  }

  private docsOf(userId: string) {
    return this.db.find<NotificationDoc>(NOTIFICATIONS, {
      where: [{field: 'userId', op: '==', value: userId}],
      orderBy: [{field: 'at', direction: 'desc'}],
      limit: LIST_SIZE,
    });
  }

  private update(docs: NotificationDoc[], data: Partial<NotificationDoc>) {
    return this.db.batch(
      docs.map((doc): Write => ({
        op: 'update',
        collection: NOTIFICATIONS,
        id: doc.id,
        data,
      })),
    );
  }

  // Once per thing that happened: liking a post twice is one notification.
  private async notify(
    id: string,
    userId: string,
    type: NotificationType,
    actorId: string,
    about: Partial<NotificationDoc>,
  ) {
    if (userId === actorId || characterOfAuthor(userId)) return;
    if (await this.db.get(NOTIFICATIONS, id)) return;
    const {username, displayName, image} = profileView(
      await this.profilesService.getProfile(actorId),
      false,
    );
    await this.tell(id, userId, type, {
      actorId,
      actor: {id: actorId, username, displayName, image},
      ...about,
    });
  }

  // Saves a notification, new and unseen; the site's own have no actor.
  private async tell(
    id: string,
    userId: string,
    type: NotificationType,
    about: Partial<NotificationDoc>,
  ) {
    await this.db.set(NOTIFICATIONS, id, {
      userId,
      type,
      ...about,
      at: this.now().getTime(),
      seen: false,
      read: false,
    });
  }

  private async quietly(work: () => Promise<unknown>) {
    try {
      await work();
    } catch (error) {
      console.error('Notifications: not saved', error);
    }
  }
}

function remove(id: string): Write {
  return {op: 'delete', collection: NOTIFICATIONS, id};
}

export {NotificationsService};
