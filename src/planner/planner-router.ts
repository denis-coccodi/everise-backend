import * as express from 'express';
import {route, sendJsonText} from '../api';
import {Auth} from '../middleware';
import {
  FightReportResponse,
  PlannerAvailableResponse,
  ReportParams,
} from './planner-schemas';
import {ClearsResponse, PullParams, PullTimelineResponse} from './pull-schemas';
import {ClearsService} from './clears-service';
import {PullSource} from './pull-source';
import {GuestLookups} from './guest-lookups';
import {ReportsService} from './reports-service';

// The fight planner: the FFLogs reports it plans from, for everyone. Each
// new report or pull spends the site's FFLogs points, so guests may only
// ask for a few an hour (GuestLookups). The planning itself runs in the
// browser.
class PlannerRouter {
  constructor(
    private readonly auth: Auth,
    private readonly reports: ReportsService,
    private readonly pulls: PullSource,
    private readonly guests: GuestLookups,
    private readonly clears: ClearsService,
  ) {}

  get router() {
    const router = express.Router();

    // Whether the site has an FFLogs client, for the site to offer the
    // planner.
    route(
      router,
      {
        method: 'get',
        path: '/planner/available',
        summary: 'Whether the fight planner is set up',
        responses: {
          200: {description: 'Whether.', schema: PlannerAvailableResponse},
        },
      },
      (_req, res) => {
        res.json({available: this.reports.available});
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/planner/reports/:code',
        summary:
          "An FFLogs report's players and its Extreme, Savage and Ultimate pulls",
        auth: this.auth.optional,
        params: ReportParams,
        responses: {
          200: {description: 'The report.', schema: FightReportResponse},
        },
      },
      async (req, res) => {
        res.json(
          await this.reports.report(
            req.params.code,
            this.guestRead(req, 'report'),
          ),
        );
      },
    );

    // Everything that happened in one pull, for the planner to plan from.
    route(
      router,
      {
        method: 'get',
        path: '/planner/reports/:code/pulls/:pullId',
        summary: "One Extreme, Savage or Ultimate pull's timeline",
        auth: this.auth.optional,
        params: PullParams,
        responses: {
          200: {description: 'The timeline.', schema: PullTimelineResponse},
        },
      },
      async (req, res) => {
        const {code, pullId} = req.params;
        const {input, finished} = await this.reports.pull(
          code,
          pullId,
          this.guestRead(req, 'report'),
        );
        sendJsonText(
          res,
          await this.pulls.timeline(
            input,
            finished,
            this.guestRead(req, 'pull'),
          ),
        );
      },
    );

    // Other groups' kills of the pull's fight, to read in turn: an attack
    // an invulnerability blocked every time in the pull shows there.
    route(
      router,
      {
        method: 'get',
        path: '/planner/reports/:code/pulls/:pullId/clears',
        summary: "Other groups' kills of a pull's fight",
        auth: this.auth.optional,
        params: PullParams,
        responses: {
          200: {description: 'The kills.', schema: ClearsResponse},
        },
      },
      async (req, res) => {
        const {code, pullId} = req.params;
        res.json({
          clears: await this.clears.clears(
            code,
            pullId,
            this.guestRead(req, 'report'),
          ),
        });
      },
    );

    return router;
  }

  // For a guest, counts a lookup FFLogs is asked for, refusing one past
  // the hour's limits; members aren't counted.
  private guestRead(
    req: Pick<express.Request, 'user' | 'header'>,
    kind: 'report' | 'pull',
  ) {
    if (req.user) return undefined;
    // Cloudflare's client address; one value for local runs.
    const address = req.header('cf-connecting-ip') ?? 'local';
    return () => this.guests.spend(kind, address);
  }
}

export {PlannerRouter};
