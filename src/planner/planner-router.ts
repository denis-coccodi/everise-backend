import * as express from 'express';
import {route, sendJsonText} from '../api';
import {Auth} from '../middleware';
import {
  FightReportResponse,
  PlannerAvailableResponse,
  ReportParams,
} from './planner-schemas';
import {PullParams, PullTimelineResponse} from './pull-schemas';
import {PullSource} from './pull-source';
import {ReportsService} from './reports-service';

// The fight planner: the FFLogs reports it plans from, for members (each
// new report spends the site's FFLogs points). The planning itself runs in
// the browser.
class PlannerRouter {
  constructor(
    private readonly auth: Auth,
    private readonly reports: ReportsService,
    private readonly pulls: PullSource,
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
        auth: this.auth.required,
        params: ReportParams,
        responses: {
          200: {description: 'The report.', schema: FightReportResponse},
        },
      },
      async (req, res) => {
        res.json(await this.reports.report(req.params.code));
      },
    );

    // Everything that happened in one pull, for the planner to plan from.
    route(
      router,
      {
        method: 'get',
        path: '/planner/reports/:code/pulls/:pullId',
        summary: "One Extreme, Savage or Ultimate pull's timeline",
        auth: this.auth.required,
        params: PullParams,
        responses: {
          200: {description: 'The timeline.', schema: PullTimelineResponse},
        },
      },
      async (req, res) => {
        const {code, pullId} = req.params;
        const {input, finished} = await this.reports.pull(code, pullId);
        sendJsonText(res, await this.pulls.timeline(input, finished));
      },
    );

    return router;
  }
}

export {PlannerRouter};
