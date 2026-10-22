import {ReportPlayer} from './fight-report-model';

// The site's FFLogs API client (made from an FFLogs account's client
// page): its id and secret. Without them the planner isn't offered.
interface FflogsSettings {
  clientId?: string;
  clientSecret?: string;
}

// Which pull, and its players (from the report's summary).
interface PullInput {
  code: string;
  pullId: number;
  startedAt: string;
  players: ReportPlayer[];
}

export {FflogsSettings, PullInput};
