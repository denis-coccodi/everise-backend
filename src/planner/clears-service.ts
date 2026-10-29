import {Db, Doc} from '../db';
import {NotFoundError} from '../errors';
import {FflogsClient} from './fflogs-client';
import {CLEARS_QUERY, clearsOf} from './fflogs-clears';
import {BeforeRead, ReportsService} from './reports-service';
import {ClearRef} from './fight-report-model';

const CLEARS = 'fflogsClears';
// How many other groups' kills are offered: the browser reads them in turn
// until it has what it needs (a report may have gone private since).
const OFFERED = 3;
// The rankings change little: asked of FFLogs again after a week.
const KEPT_MS = 7 * 24 * 60 * 60 * 1000;
// FFLogs' difficulty for a kind of fight.
const DIFFICULTY = {savage: 101, extreme: 100, ultimate: 100} as const;

// Kept per fight and difficulty ("<encounter>:<difficulty>").
interface StoredClears extends Doc {
  clears: ClearRef[];
  fetchedAt: number;
}

// Other groups' kills of a pull's fight, for the planner to read what the
// pull doesn't show (an attack an invulnerability blocked every time).
// Kept, so FFLogs is asked once a week per fight.
class ClearsService {
  constructor(
    private readonly db: Db,
    private readonly client: FflogsClient,
    private readonly reports: ReportsService,
    private readonly now: () => Date,
  ) {}

  // `beforeRead` runs before FFLogs is asked (for the report, or the
  // rankings), and may refuse it by throwing.
  async clears(
    code: string,
    pullId: number,
    beforeRead?: BeforeRead,
  ): Promise<ClearRef[]> {
    const report = await this.reports.report(code, beforeRead);
    const pull = report.pulls.find(p => p.id === pullId);
    if (!pull) {
      throw new NotFoundError(
        "That pull isn't in this report, or isn't an Extreme, Savage or Ultimate fight. Pick one from the report's pulls.",
      );
    }
    const difficulty = DIFFICULTY[pull.kind];
    const id = `${pull.encounterId}:${difficulty}`;
    const stored = await this.db.get<StoredClears>(CLEARS, id);
    const clears =
      stored && this.now().getTime() - stored.fetchedAt < KEPT_MS
        ? stored.clears
        : await this.read(id, pull.encounterId, difficulty, beforeRead);
    return clears.filter(c => c.code !== code).slice(0, OFFERED);
  }

  private async read(
    id: string,
    encounter: number,
    difficulty: number,
    beforeRead?: BeforeRead,
  ) {
    await beforeRead?.();
    const data = await this.client.query(CLEARS_QUERY, {encounter, difficulty});
    // One more than offered: the group's own may be among them.
    const clears = clearsOf(data).slice(0, OFFERED + 1);
    await this.db.set(CLEARS, id, {clears, fetchedAt: this.now().getTime()});
    return clears;
  }
}

export {ClearsService};
