import {Db, Doc} from '../db';
import {UpstreamError} from '../errors';
import {FflogsClient} from './fflogs-client';
import {REPORT_QUERY, reportOf, toLoggedReport} from './fflogs-reports';
import {
  FightKinds,
  FightReport,
  LoggedReport,
  coveredReport,
} from './fight-report';

const REPORTS = 'fflogsReports';

// A report still being logged is read again after this long.
const REFRESH_MS = 2 * 60 * 1000;
// A report that ended this long before it was read won't change any more.
const FINISHED_MS = 60 * 60 * 1000;

// Every boss pull is kept, so a game data refresh that adds a fight's
// territory makes its pulls show without reading the report again.
interface StoredReport extends Doc {
  report: LoggedReport;
  fetchedAt: number;
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

  private fresh({report, fetchedAt}: StoredReport) {
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
    await this.db.set(REPORTS, code, {report, fetchedAt});
    return report;
  }
}

export {ReportsService, REFRESH_MS, FINISHED_MS};
