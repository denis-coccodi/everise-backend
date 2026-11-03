import {Db, Doc} from '../../db';
import {ScriptsService} from './scripts-service';

// How the app reaches GitHub for cactbot's files (tests pass a fake).
type CactbotFetch = (
  url: string,
  init?: {headers?: Record<string, string>},
) => Promise<{
  ok: boolean;
  status: number;
  headers: {get(name: string): string | null};
  text(): Promise<string>;
}>;

const REPO = 'OverlayPlugin/cactbot';
const API = `https://api.github.com/repos/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${REPO}`;
// Where cactbot keeps its timelines, a folder per expansion (02-arr ...
// 07-dt; the next one's is picked up when it comes).
const DATA = 'ui/raidboss/data';
// Of their files, the Savage, Extreme and Ultimate fights' timelines, in
// every expansion: older fights are played with today's jobs too. Savage
// raids are a letter, a number and "s" (a1s, o1s, e1s, p1s, r1s); Extreme
// trials end "-ex" (not "-hm" or "-un"); every Ultimate.
const FIGHT_FILE =
  /^0[1-9]-[a-z]+\/(raid\/[a-z]\d+s|trial\/[^/]+-ex|ultimate\/[^/]+)\.txt$/;
// How often cactbot's latest commit is asked for; files are read a few a
// run (each run is a Worker invocation, with few outbound requests).
const CHECK_MS = 60 * 60 * 1000;
const BATCH = 3;
const MAX_ATTEMPTS = 3;
// Long enough for one run; a run that died leaves it to lapse.
const LEASE_MS = 90 * 1000;
const SYNC = 'plannerScriptsSync';
const SYNC_ID = 'cactbot';
// Which files are listed. Raised whenever FIGHT_FILE changes, so the next
// check lists cactbot again though its commit hasn't changed (2: every
// expansion, not only the latest).
const LISTING = 2;
// GitHub's API wants a User-Agent; the version header pins its answers.
const HEADERS = {
  'user-agent': 'everise-planner',
  accept: 'application/vnd.github+json',
};

// Where the copy of cactbot's timelines stands: the commit last listed
// (and its ETag, so asking again costs nothing when it's unchanged), by
// which listing, each fight file's content hash as kept, and the files
// still to read.
interface SyncDoc extends Doc {
  commit?: string;
  etag?: string;
  listing?: number;
  checkedAt?: number;
  files?: Record<string, string>;
  pending?: {path: string; sha: string; attempts: number}[];
  until?: number;
}

// Keeps the fights' scripts as cactbot has them, on the Worker's cron
// trigger: about once an hour it asks for cactbot's latest commit; when
// that changed, it lists the timeline folders and queues the fight files
// whose content changed, then reads them a few per run (from
// raw.githubusercontent.com, which GitHub's API limits don't cover).
// So a script is at most about an hour behind cactbot.
class ScriptsSync {
  constructor(
    private readonly db: Db,
    private readonly scripts: ScriptsService,
    private readonly fetch: CactbotFetch,
    private readonly now: () => Date,
  ) {}

  // One run; `force` asks for the latest commit whatever the time. Null
  // when another run holds the lease.
  async sync(force = false) {
    const now = this.now().getTime();
    if (
      !(await this.db.takeLease(SYNC, SYNC_ID, 'until', now, now + LEASE_MS))
    ) {
      return null;
    }
    try {
      let state =
        (await this.db.get<SyncDoc>(SYNC, SYNC_ID)) ?? ({} as SyncDoc);
      const due = force || now - (state.checkedAt ?? -Infinity) >= CHECK_MS;
      if (!state.pending?.length && due) state = await this.check(state, now);
      const {kept, left} = state.pending?.length
        ? await this.readSome(state)
        : {kept: [], left: 0};
      return {commit: state.commit ?? null, pending: left, kept};
    } finally {
      await this.db.update(SYNC, SYNC_ID, {until: 0});
    }
  }

  // The latest commit; when it changed, the fight files whose content did.
  private async check(state: SyncDoc, now: number): Promise<SyncDoc> {
    const head = await this.fetch(`${API}/commits/main`, {
      headers: {
        ...HEADERS,
        ...(state.etag && state.listing === LISTING
          ? {'if-none-match': state.etag}
          : {}),
      },
    });
    if (head.status === 304) return this.save({...state, checkedAt: now});
    if (!head.ok)
      throw new Error(`GitHub answered ${head.status} for cactbot's commit`);
    const commit = String(
      (JSON.parse(await head.text()) as {sha?: unknown}).sha,
    );
    // Every timeline folder in one listing (about 800 entries, 190 KB).
    const response = await this.fetch(
      `${API}/git/trees/${commit}:${DATA}?recursive=1`,
      {headers: HEADERS},
    );
    if (!response.ok)
      throw new Error(`GitHub answered ${response.status} for ${DATA}`);
    const tree = JSON.parse(await response.text()) as {
      truncated?: unknown;
      tree?: {path?: unknown; sha?: unknown; type?: unknown}[];
    };
    if (tree.truncated) throw new Error(`GitHub cut the listing of ${DATA}`);
    const listed: {path: string; sha: string}[] = [];
    for (const {path, sha, type} of tree.tree ?? []) {
      if (
        type === 'blob' &&
        typeof path === 'string' &&
        typeof sha === 'string' &&
        FIGHT_FILE.test(path)
      ) {
        listed.push({path: `${DATA}/${path}`, sha});
      }
    }
    const files = state.files ?? {};
    const pending = listed
      .filter(f => files[f.path] !== f.sha)
      .map(f => ({...f, attempts: 0}));
    return this.save({
      ...state,
      commit,
      etag: head.headers.get('etag') ?? undefined,
      listing: LISTING,
      checkedAt: now,
      pending,
    });
  }

  // Reads and keeps the next few pending files. One that fails goes to
  // the back, and is dropped after a few tries (it's queued again with the
  // next commit that changes it).
  private async readSome(state: SyncDoc) {
    const pending = [...(state.pending ?? [])];
    const files = {...(state.files ?? {})};
    const kept: number[] = [];
    let zoneIds: Map<string, number> | undefined;
    for (const file of pending.splice(0, BATCH)) {
      try {
        const text = await this.raw(state.commit ?? 'main', file.path);
        let zone = Number(/^#\s*ZoneId:\s*(\d+)/m.exec(text)?.[1]);
        if (!zone) {
          // Older files say it only in their triggers, by name.
          const triggers = await this.raw(
            state.commit ?? 'main',
            file.path.replace(/\.txt$/, '.ts'),
          );
          const name = /zoneId:\s*ZoneId\.(\w+)/.exec(triggers)?.[1] ?? '';
          zoneIds ??= await this.zoneIds(state.commit ?? 'main');
          zone = zoneIds.get(name) ?? 0;
        }
        if (!zone) throw new Error(`no zone for ${file.path}`);
        await this.scripts.store(
          {commit: state.commit ?? '', path: file.path},
          zone,
          text,
        );
        files[file.path] = file.sha;
        kept.push(zone);
      } catch (error) {
        console.error(`Fight scripts: reading ${file.path} failed`, error);
        if (file.attempts + 1 < MAX_ATTEMPTS)
          pending.push({...file, attempts: file.attempts + 1});
      }
    }
    await this.save({...state, files, pending});
    return {kept, left: pending.length};
  }

  private async raw(commit: string, path: string) {
    const response = await this.fetch(`${RAW}/${commit}/${path}`);
    if (!response.ok)
      throw new Error(`GitHub answered ${response.status} for ${path}`);
    return response.text();
  }

  // Cactbot's zone names to the game's zone ids (resources/zone_id.ts).
  private async zoneIds(commit: string) {
    const text = await this.raw(commit, 'resources/zone_id.ts');
    return new Map(
      [...text.matchAll(/^\s*'(\w+)':\s*(\d+),/gm)].map(m => [
        m[1],
        Number(m[2]),
      ]),
    );
  }

  private async save(state: SyncDoc) {
    const {commit, etag, listing, checkedAt, files, pending, until} = state;
    await this.db.set(SYNC, SYNC_ID, {
      ...(commit ? {commit} : {}),
      ...(etag ? {etag} : {}),
      listing: listing ?? 0,
      checkedAt: checkedAt ?? 0,
      files: files ?? {},
      pending: pending ?? [],
      until: until ?? 0,
    });
    return state;
  }
}

export {CactbotFetch, ScriptsSync};
