import {RelayedPostDoc} from './relay-model';

// How long a hunt train counts as running after it starts: a single
// expansion's train takes well under an hour, a triple train with breaks
// longer.
const RUNNING_MS = 2 * 60 * 60 * 1000;

// The relayed messages no longer worth showing. Weekly posts: all but the
// latest Fashion Report and Island Sanctuary season. Hunt trains, per data
// centre: all but those to come, those still running, and the last one
// that started.
function outdated(docs: RelayedPostDoc[], now: Date) {
  const groups = new Map<string, RelayedPostDoc[]>();
  for (const doc of docs) {
    const group = `${doc.kind}:${doc.dataCentre ?? ''}`;
    groups.set(group, [...(groups.get(group) ?? []), doc]);
  }
  const old: RelayedPostDoc[] = [];
  for (const group of groups.values()) {
    if (group[0].kind !== 'hunt') {
      const latest = Math.max(...group.map(doc => doc.postedAt.getTime()));
      old.push(...group.filter(doc => doc.postedAt.getTime() < latest));
      continue;
    }
    const started = group
      .map(doc => ({doc, at: (doc.startsAt ?? doc.postedAt).getTime()}))
      .filter(train => train.at <= now.getTime())
      .sort((a, b) => b.at - a.at);
    old.push(
      ...started
        .slice(1)
        .filter(train => train.at < now.getTime() - RUNNING_MS)
        .map(train => train.doc),
    );
  }
  return old;
}

export {outdated};
