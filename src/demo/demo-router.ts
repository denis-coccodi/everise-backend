import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {Auth} from '../middleware';
import {DemoContentService} from './demo-content-service';
import {DemoContentResponse} from './demo-schemas';

// The demo content: whether it's there (for everyone, so the site can label
// it), and adding or removing it (admins only).
class DemoRouter {
  constructor(
    private readonly auth: Auth,
    private readonly demoContent: DemoContentService,
  ) {}

  get router() {
    const router = express.Router();
    const auth = this.auth.admin;

    route(
      router,
      {
        method: 'get',
        path: '/demo-content',
        summary: 'Whether the site shows demo content',
        responses: {
          200: {description: 'Whether it does.', schema: DemoContentResponse},
        },
      },
      async (_req, res) => {
        res.json({demoContent: await this.demoContent.status()});
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/admin/demo-content',
        summary: 'Add the demo members, posts and comments',
        auth,
        responses: {
          201: {description: 'It was added.', schema: DemoContentResponse},
        },
      },
      async (_req, res) => {
        res
          .status(StatusCodes.CREATED)
          .json({demoContent: await this.demoContent.add()});
      },
    );

    route(
      router,
      {
        method: 'delete',
        path: '/admin/demo-content',
        summary: 'Remove the demo content and everything added to it',
        auth,
        responses: {
          200: {description: 'It was removed.', schema: DemoContentResponse},
        },
      },
      async (_req, res) => {
        res.json({demoContent: await this.demoContent.remove()});
      },
    );

    return router;
  }
}

export {DemoRouter};
