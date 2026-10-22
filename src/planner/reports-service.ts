import {Db, Doc} from '../db';
import {NotFoundError, UpstreamError} from '../errors';
import {FflogsClient} from './fflogs-client';
import {REPORT_QUERY, reportOf, toLoggedReport} from './fflogs-reports';
import {coveredReport} from './fight-report';
import {PullInput} from './fflogs-model';
import {FightKinds, FightReport, LoggedReport} from './fight-report-model';

const REPORTS = 'fflogsReports';

// A report still being logged is read again after this long.
const REFRESH_MS = 2 * 60 * 1000;
// A report that ended this long before it was read won't change any more.
const FINISHED_MS = 60 * 60 * 1000;
// How reports are read from FFLogs. Raised whenever that changes, so the
// reports kept before are read again.
const READ_VERSION = 2;

// Every boss pull is kept, so a game data refresh that adds a fight's
// territory makes its pulls show without reading the report again.
interface StoredReport extends Doc {
  report: LoggedReport;
  fetchedAt: number;
  // Unset on reports kept before versions (1).
  version?: number;
}

// The FFLogs reports people load in the fight planner, kept so the same
// report isn't asked of FFLogs again (each read spends the site's FFLogs
// points). A finished report is kept as read.
class ReportsService {
  private readonly reading = new Map<string, Promise<LoggedReport>>();

  constructor(
    private readonly db: Db,
    private readonly client: FflogsClient,
    // What kind of fight each game territory holds (the duties' game data).
    private readonly fightKinds: () => Promise<FightKinds>,
    private readonly now: () => Date,
  ) {}

  get available() {
    return this.client.available;
  }

  async report(code: string): Promise<FightReport> {
    const [logged, kinds] = await Promise.all([
      this.logged(code),
      this.fightKinds(),
    ]);
    return coveredReport(logged, kinds);
  }

  // One of the report's Extreme, Savage or Ultimate pulls and its players,
  // to read its timeline; `finished` when the report won't change any more.
  async pull(
    code: string,
    pullId: number,
  ): Promise<{input: PullInput; finished: boolean}> {
    const report = await this.report(code);
    const pull = report.pulls.find(p => p.id === pullId);
    if (!pull) {
      throw new NotFoundError(
        "That pull isn't in this report, or isn't an Extreme, Savage or Ultimate fight. Pick one from the report's pulls.",
      );
    }
    const inPull = new Set(pull.playerIds);
    return {
      input: {
        code,
        pullId,
        startedAt: pull.startedAt,
        players: report.players.filter(player => inPull.has(player.id)),
      },
      finished:
        this.now().getTime() - Date.parse(report.endedAt) >= FINISHED_MS,
    };
  }

  private async logged(code: string) {
    const stored = await this.db.get<StoredReport>(REPORTS, code);
    if (stored && this.fresh(stored)) return stored.report;
    // One read of a report at a time: requests arriving meanwhile wait.
    let reading = this.reading.get(code);
    if (!reading) {
      reading = this.read(code).finally(() => this.reading.delete(code));
      this.reading.set(code, reading);
    }
    return reading;
  }

  private fresh({report, fetchedAt, version}: StoredReport) {
    if (version !== READ_VERSION) return false;
    return (
      fetchedAt - Date.parse(report.endedAt) >= FINISHED_MS ||
      this.now().getTime() - fetchedAt < REFRESH_MS
    );
  }

  private async read(code: string) {
    const fetchedAt = this.now().getTime();
    const found = reportOf(await this.client.query(REPORT_QUERY, {code}));
    if (!found) {
      throw new UpstreamError(
        "FFLogs didn't send that report. Try again in a few minutes.",
      );
    }
    const report = toLoggedReport(found);
    await this.db.set(REPORTS, code, {
      report,
      fetchedAt,
      version: READ_VERSION,
    });
    return report;
  }
}

export {ReportsService, REFRESH_MS, FINISHED_MS};
