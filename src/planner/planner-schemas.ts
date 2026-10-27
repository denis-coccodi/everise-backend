import {z} from 'zod';
import {isoDate, responseSchema} from '../api';
import {PULL_KINDS, ROLES} from './fight-report';

// An FFLogs report's code, from its link (fflogs.com/reports/<code>);
// anonymous reports' start with "a:".
const REPORT_CODE = /^(a:)?[A-Za-z0-9]{16}$/;

const ReportParams = z.object({
  code: z.string().regex(REPORT_CODE, {
    error:
      "That isn't an FFLogs report link. Copy it from the report's page (fflogs.com/reports/…).",
  }),
});

const PlannerAvailableResponse = responseSchema(
  'PlannerAvailableResponse',
  z.strictObject({available: z.boolean()}),
);

const ReportPlayer = z.strictObject({
  // The report's own id for the player.
  id: z.number().int(),
  name: z.string(),
  server: z.string().nullable(),
  // The job's abbreviation (WHM, PLD, ...); null for one the site doesn't
  // know.
  job: z.string().nullable(),
  role: z.enum(ROLES).nullable(),
});

const ReportPull = z.strictObject({
  // The report's own id for the pull.
  id: z.number().int(),
  encounterId: z.number().int(),
  // The boss.
  name: z.string(),
  kind: z.enum(PULL_KINDS),
  kill: z.boolean(),
  startedAt: isoDate,
  durationMs: z.number().int().min(0),
  // What was left of the boss and of the whole fight (all phases), in
  // percent; 0 on a kill.
  bossHpLeft: z.number().nullable(),
  fightLeft: z.number().nullable(),
  // The last phase reached, from 1; null for fights without phases.
  phase: z.number().int().nullable(),
  playerIds: z.array(z.number().int()),
});

const FightReportResponse = responseSchema(
  'FightReportResponse',
  z.strictObject({
    code: z.string(),
    title: z.string(),
    startedAt: isoDate,
    endedAt: isoDate,
    // The players in the pulls below.
    players: z.array(ReportPlayer),
    // The Extreme, Savage and Ultimate pulls, in order.
    pulls: z.array(ReportPull),
    // How many pulls of other fights the report has, left out.
    otherPulls: z.number().int().min(0),
    // The expansion its fights belong to on FFLogs, null when it doesn't say.
    expansion: z.string().nullable(),
    // Recorded in an earlier expansion than the latest: no pulls planned.
    outdated: z.boolean(),
  }),
);

export {FightReportResponse, PlannerAvailableResponse, ReportParams};
