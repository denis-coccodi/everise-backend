import {Doc} from '../db';

// Who did it, as they were then: the list is one read, without looking
// every member up again.
interface Actor {
  id: string;
  username: string;
  // What the site called them ("Avar Kriss (Odin)"); missing on those kept
  // before character names, which show the username.
  displayName?: string;
  image: string;
}

// A shared Party Finder listing, as it was shared.
interface SharedListingRef {
  listingId: string;
  dataCentre: string;
  title: string;
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

// What happened to a member's things: their post was liked (favorited) or
// commented on, or another member followed them; a Party Finder listing
// they shared is no longer up; an admin changed their role.
type NotificationType = 'favorite' | 'comment' | 'follow' | 'pf-ended' | 'role';

export {
  Actor,
  NotificationDoc,
  NotificationGroup,
  NotificationType,
  SharedListingRef,
};
