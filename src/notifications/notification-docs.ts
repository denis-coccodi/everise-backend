import {Doc} from '../db';

// What happened to a member's things: their post was liked (favorited) or
// commented on, or another member followed them; a Party Finder listing
// they shared is no longer up; an admin changed their role.
type NotificationType = 'favorite' | 'comment' | 'follow' | 'pf-ended' | 'role';

// The kinds the site tells of, with no member who did it.
const SYSTEM_TYPES: NotificationType[] = ['pf-ended', 'role'];

// A shared Party Finder listing, as it was shared.
interface SharedListingRef {
  listingId: string;
  dataCentre: string;
  title: string;
}

// Who did it, as they were then: the list is one read, without looking
// every member up again.
interface Actor {
  id: string;
  username: string;
  image: string;
}

// One notification, for `userId`. Its id says what it's about, so the same
// thing twice is one notification (favorite:<post>:<member>,
// follow:<followee>:<follower>, comment:<comment>), and undoing it (an
// unfavorite, an unfollow, a deleted comment) deletes it. The site's own
// (pf-ended:<share>, role:<member>:<ms>) have no actor.
interface NotificationDoc extends Doc {
  userId: string;
  type: NotificationType;
  actor?: Actor;
  // Who did it (the actor's id), for deleting a member's notifications.
  actorId?: string;
  // The post it's about (favorite, comment), with its title then.
  articleId?: string;
  articleTitle?: string;
  // The comment, its opening words then.
  commentId?: string;
  commentExcerpt?: string;
  // The shared Party Finder listing that ended (pf-ended).
  partyFinder?: SharedListingRef;
  // The member's new role (role): 'staging-tester', or 'user'.
  role?: string;
  // When (ms): the list is newest first.
  at: number;
  // Seen: the member opened the list since (the badge counts the others).
  // Read: they opened that notification (or marked all read).
  seen: boolean;
  read: boolean;
}

const NOTIFICATIONS = 'notifications';

// The notifications a member's list is made from: the newest.
const LIST_SIZE = 100;
// The most notifications the list shows, once grouped.
const GROUPS_SHOWN = 30;
// The most members a grouped notification names; the count says the rest.
const ACTORS_NAMED = 3;
// A comment's opening words, in a notification.
const EXCERPT_LENGTH = 120;

// One line of the list: everything about one post of the same kind (all
// its likes, all its comments) together, or one follow.
interface NotificationGroup {
  id: string;
  type: NotificationType;
  at: Date;
  seen: boolean;
  read: boolean;
  // The newest first, at most ACTORS_NAMED; actorCount counts them all.
  actors: Actor[];
  actorCount: number;
  article: {id: string; title: string} | null;
  // The newest comment, on a comment notification.
  comment: {id: string; excerpt: string} | null;
  partyFinder: SharedListingRef | null;
  role: string | null;
}

// The group a notification belongs to.
function groupKey(doc: NotificationDoc) {
  return doc.type === 'follow' || SYSTEM_TYPES.includes(doc.type)
    ? doc.id
    : `${doc.type}:${doc.articleId}`;
}

// The newest notifications, grouped, newest first.
function grouped(docs: NotificationDoc[]): NotificationGroup[] {
  const groups = new Map<string, NotificationDoc[]>();
  for (const doc of [...docs].sort((a, b) => b.at - a.at)) {
    const key = groupKey(doc);
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }
  return [...groups]
    .slice(0, GROUPS_SHOWN)
    .map(([id, [newest, ...rest]]): NotificationGroup => {
      const all = [newest, ...rest];
      const actors = [
        ...new Map(
          all.flatMap((doc): [string, Actor][] =>
            doc.actor ? [[doc.actor.id, doc.actor]] : [],
          ),
        ).values(),
      ];
      return {
        id,
        type: newest.type,
        at: new Date(newest.at),
        seen: all.every(doc => doc.seen),
        read: all.every(doc => doc.read),
        actors: actors.slice(0, ACTORS_NAMED),
        actorCount: actors.length,
        article: newest.articleId
          ? {id: newest.articleId, title: newest.articleTitle ?? ''}
          : null,
        comment: newest.commentId
          ? {id: newest.commentId, excerpt: newest.commentExcerpt ?? ''}
          : null,
        partyFinder: newest.partyFinder ?? null,
        role: newest.role ?? null,
      };
    });
}

// A comment's opening words: one line, cut at a word.
function excerpt(body: string) {
  const line = body.replace(/\s+/g, ' ').trim();
  if (line.length <= EXCERPT_LENGTH) return line;
  const cut = line.slice(0, EXCERPT_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

export {
  Actor,
  SharedListingRef,
  LIST_SIZE,
  NOTIFICATIONS,
  NotificationDoc,
  NotificationGroup,
  NotificationType,
  excerpt,
  groupKey,
  grouped,
};
