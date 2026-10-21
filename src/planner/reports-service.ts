import {Db, Doc} from '../db';
import {UpstreamError} from '../errors';
import {FflogsClient} from './fflogs-client';
import {
  REPORT_QUERY,
  encounterIds,
  encountersQuery,
  reportOf,
  toReport,
  zoneNames,
} from './fflogs-reports';
import {FightReport} from './fight-report';

const REPORTS = 'fflogsReports';
const ENCOUNTERS = 'fflogsEncounters';

// A report still being logged is read again after this long.
const REFRESH_MS = 2 * 60 * 1000;
// A report that ended this long before it was read won't change any more.
const FINISHED_MS = 60 * 60 * 1000;

interface StoredReport extends Doc {
  report: FightReport;
  fetchedAt: number;
}

// An FFLogs encounter's zone, which says whether it's an Extreme, Savage
// or Ultimate fight. Encounters never move, so they're kept for good.
interface StoredEncounter extends Doc {
  zone: string;
}

// The FFLogs reports people load in the fight planner, kept so the same
// report isn't asked of FFLogs again (each read spends the site's FFLogs
// points). A finished report is kept as read.
class ReportsService {
  private readonly reading = new Map<string, Promise<FightReport>>();

  constructor(
    private readonly db: Db,
    private readonly client: FflogsClient,
    private readonly now: () => Date,
  ) {}

  get available() {
    return this.client.available;
  }

  async report(code: string): Promise<FightReport> {
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
    const zones = await this.zones(encounterIds(found));
    const report = toReport(found, zones);
    await this.db.set(REPORTS, code, {report, fetchedAt});
    return report;
  }

  // The zone of each encounter: the ones not kept yet are asked of FFLogs.
  private async zones(ids: number[]) {
    const zones = new Map<number, string>();
    const kept = await this.db.find<StoredEncounter>(ENCOUNTERS);
    for (const encounter of kept)
      zones.set(Number(encounter.id), encounter.zone);
    const missing = ids.filter(id => !zones.has(id));
    if (!missing.length) return zones;
    const found = zoneNames(
      await this.client.query(encountersQuery(missing), {}),
    );
    // A report has pulls of a few encounters at most.
    for (const [id, zone] of found) {
      await this.db.set(ENCOUNTERS, String(id), {zone});
      zones.set(id, zone);
    }
    return zones;
  }
}

export {ReportsService, REFRESH_MS, FINISHED_MS};
