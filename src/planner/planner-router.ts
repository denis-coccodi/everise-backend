import * as express from 'express';
import {route} from '../api';
import {Auth} from '../middleware';
import {
  FightReportResponse,
  PlannerAvailableResponse,
  ReportParams,
} from './planner-schemas';
import {ReportsService} from './reports-service';

// The fight planner: the FFLogs reports it plans from, for members (each
// new report spends the site's FFLogs points). The planning itself runs in
// the browser.
class PlannerRouter {
  constructor(
    private readonly auth: Auth,
    private readonly reports: ReportsService,
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

    return router;
  }
}

export {PlannerRouter};
