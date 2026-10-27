import {z} from 'zod';
import {isoDate, responseSchema} from '../api';

// Who did it, as they were then: their profile is /profile/<username>.
const NotificationActor = z.strictObject({
  id: z.string(),
  username: z.string(),
  // What the site called them then ("Avar Kriss (Odin)", or the username).
  displayName: z.string(),
  image: z.string(),
});

// One line of a member's list: a like (favorite), comment or follow, with
// everything about one post of the same kind together ("Alphinaud and 2
// others liked your post"); or the site's own news, with no members: a
// Party Finder listing the member shared is no longer up (pf-ended), an
// admin changed their role (role).
const Notification = z.strictObject({
  // What the list calls it: for marking it read.
  id: z.string(),
  type: z.enum(['favorite', 'comment', 'follow', 'pf-ended', 'role']),
  // The newest of them.
  at: isoDate,
  // Seen: the member opened the list since. Read: they opened this one.
  seen: z.boolean(),
  read: z.boolean(),
  // The newest first, at most 3; actorCount counts them all.
  actors: z.array(NotificationActor),
  actorCount: z.number().int(),
  // The post it's about (a like or a comment), its title then.
  article: z.strictObject({id: z.string(), title: z.string()}).nullable(),
  // The newest comment's opening words.
  comment: z.strictObject({id: z.string(), excerpt: z.string()}).nullable(),
  // The shared listing that's no longer up (pf-ended), as it was shared;
  // `article` is the post, when it was shared as one.
  partyFinder: z
    .strictObject({
      listingId: z.string(),
      dataCentre: z.string(),
      title: z.string(),
    })
    .nullable(),
  // The member's new role (role): 'staging-tester', or 'user'.
  role: z.string().nullable(),
});

const NotificationsResponse = responseSchema(
  'NotificationsResponse',
  z.strictObject({
    notifications: z.array(Notification),
    // Notifications not seen yet: the badge.
    unseenCount: z.number().int(),
  }),
);

const UnseenNotificationsResponse = responseSchema(
  'UnseenNotificationsResponse',
  z.strictObject({unseenCount: z.number().int()}),
);

const NotificationParams = z.object({id: z.string().max(200)});

export {NotificationParams, NotificationsResponse, UnseenNotificationsResponse};
