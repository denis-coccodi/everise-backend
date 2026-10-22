import {
  Actor,
  NotificationDoc,
  NotificationGroup,
  NotificationType,
} from './notification-model';

// The kinds the site tells of, with no member who did it.
const SYSTEM_TYPES: NotificationType[] = ['pf-ended', 'role'];

const NOTIFICATIONS = 'notifications';

// The notifications a member's list is made from: the newest.
const LIST_SIZE = 100;
// The most notifications the list shows, once grouped.
const GROUPS_SHOWN = 30;
// The most members a grouped notification names; the count says the rest.
const ACTORS_NAMED = 3;
// A comment's opening words, in a notification.
const EXCERPT_LENGTH = 120;

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

export {LIST_SIZE, NOTIFICATIONS, excerpt, groupKey, grouped};
