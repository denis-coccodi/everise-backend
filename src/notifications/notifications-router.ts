import * as express from 'express';
import {route} from '../api';
import {Auth} from '../middleware';
import {
  NotificationParams,
  NotificationsResponse,
  UnseenNotificationsResponse,
} from './notification-schemas';
import {NotificationsService} from './notifications-service';

// A member's notifications, for the bell in the site's header: the list,
// how many are new (asked for often, so cheap), and marking them seen (the
// list was opened) or read (one was opened, or all of them). Members only;
// nobody's notifications are kept by a shared cache.
class NotificationsRouter {
  constructor(
    private readonly auth: Auth,
    private readonly notificationsService: NotificationsService,
  ) {}

  get router() {
    const router = express.Router();
    const list = {
      200: {description: 'The notifications.', schema: NotificationsResponse},
    };
    const noStore = (res: express.Response) =>
      res.set('Cache-Control', 'private, no-store');

    route(
      router,
      {
        method: 'get',
        path: '/notifications',
        summary: "The member's notifications, newest first",
        auth: this.auth.required,
        responses: list,
      },
      async (req, res) => {
        noStore(res).json(await this.notificationsService.list(req.user!.id));
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/notifications/unseen',
        summary: "How many of the member's notifications are new",
        auth: this.auth.required,
        responses: {
          200: {description: 'How many.', schema: UnseenNotificationsResponse},
        },
      },
      async (req, res) => {
        const unseenCount = await this.notificationsService.unseenCount(
          req.user!.id,
        );
        noStore(res).json({unseenCount});
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/notifications/seen',
        summary: 'The member opened their notifications: none are new',
        auth: this.auth.required,
        responses: list,
      },
      async (req, res) => {
        noStore(res).json(
          await this.notificationsService.markSeen(req.user!.id),
        );
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/notifications/read',
        summary: 'Mark all notifications read',
        auth: this.auth.required,
        responses: list,
      },
      async (req, res) => {
        noStore(res).json(
          await this.notificationsService.markRead(req.user!.id),
        );
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/notifications/:id/read',
        summary: 'Mark one notification read',
        auth: this.auth.required,
        params: NotificationParams,
        responses: list,
      },
      async (req, res) => {
        noStore(res).json(
          await this.notificationsService.markRead(req.user!.id, req.params.id),
        );
      },
    );

    return router;
  }
}

export {NotificationsRouter};
