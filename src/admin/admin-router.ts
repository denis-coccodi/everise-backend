import {celebrate, Joi, Segments} from 'celebrate';
import * as express from 'express';
import {config} from '../config';
import {ForbiddenError, InvalidImageError} from '../errors';
import {Auth} from '../middleware';
import {
  ASSIGNABLE_ROLES,
  AssignableRole,
  ProfileImagesService,
  TataruAccount,
  User,
  UsersService,
  profileImageUrl,
  readImageBody,
  uploadedImageId,
} from '../users';
import {bio} from '../users/user-fields';
import {StagingAccess} from './staging-access';

// The picture shown for someone who hasn't uploaded one, as in UserDto.
const pictureOf = (user: User) =>
  user.image || `${config.baseUrl}/assets/images/avatar-profile.png`;

// A member as the admin's list shows them.
function memberDto(user: User) {
  return {
    username: user.username,
    email: user.email,
    image: pictureOf(user),
    role: user.role,
  };
}

function tataruDto(tataru: User) {
  return {
    tataru: {
      username: tataru.username,
      bio: tataru.bio || null,
      image: pictureOf(tataru),
    },
  };
}

// The admin's tools, all under /api/admin and only for admins (ADMIN_EMAILS):
// members and their roles (a staging tester may open the staging site, kept
// in Cloudflare Access by StagingAccess), and Tataru's profile.
class AdminRouter {
  constructor(
    private readonly auth: Auth,
    private readonly usersService: UsersService,
    private readonly profileImagesService: ProfileImagesService,
    private readonly tataru: TataruAccount,
    private readonly stagingAccess: StagingAccess
  ) {}

  get router() {
    const router = express.Router();

    router.use('/admin', this.auth.requireAuth, requireAdmin);

    // A page of members, optionally only those whose username or email
    // contains `search`; `usersCount` is how many match in all.
    router.get(
      '/admin/users',
      celebrate({
        [Segments.QUERY]: Joi.object().keys({
          search: Joi.string().allow('').max(100),
          limit: Joi.number().integer().min(1).max(100),
          offset: Joi.number().integer().min(0),
        }),
      }),
      async (req, res, next) => {
        try {
          // Validated above; Express 5 keeps the query as strings.
          const query = req.query as Record<string, string | undefined>;
          const search = query.search ?? '';
          const limit = query.limit ? Number(query.limit) : 20;
          const offset = query.offset ? Number(query.offset) : 0;
          const {users, count} = await this.usersService.searchMembers(
            search,
            limit,
            offset
          );
          return res.json({
            users: users.map(memberDto),
            usersCount: count,
            // Whether role changes reach the staging Access list.
            stagingAccessConnected: this.stagingAccess.connected,
          });
        } catch (err) {
          return next(err);
        }
      }
    );

    router.put(
      '/admin/users/:username/role',
      celebrate({
        [Segments.BODY]: Joi.object()
          .keys({
            role: Joi.string()
              .valid(...ASSIGNABLE_ROLES)
              .required()
              .messages({
                'any.only': 'Choose "user" or "staging-tester".',
                'any.required': 'Choose a role.',
              }),
          })
          .required(),
      }),
      async (req, res, next) => {
        try {
          const user = await this.usersService.setRole(
            req.params.username,
            req.body.role as AssignableRole
          );
          const stagingAccess = await this.syncStagingAccess();
          return res.json({user: memberDto(user), stagingAccess});
        } catch (err) {
          return next(err);
        }
      }
    );

    // Writes the staging testers to Cloudflare Access again, e.g. after
    // setting it up or after a failed sync.
    router.post('/admin/staging-access', async (_req, res, next) => {
      try {
        return res.json({stagingAccess: await this.syncStagingAccess()});
      } catch (err) {
        return next(err);
      }
    });

    router.get('/admin/tataru', async (_req, res, next) => {
      try {
        return res.json(tataruDto(await this.tataru.get()));
      } catch (err) {
        return next(err);
      }
    });

    router.put(
      '/admin/tataru',
      celebrate({
        [Segments.BODY]: Joi.object()
          .keys({tataru: Joi.object().keys({bio: bio()}).required()})
          .required(),
      }),
      async (req, res, next) => {
        try {
          const tataru = await this.tataru.get();
          const updated = await this.usersService.updateUser(tataru.id, {
            bio: req.body.tataru.bio,
          });
          return res.json(tataruDto(updated));
        } catch (err) {
          return next(err);
        }
      }
    );

    // A new picture for Tataru: the file as the request body, with the same
    // checks as anyone's upload. The old one is deleted.
    router.put('/admin/tataru/image', readImageBody, async (req, res, next) => {
      try {
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          throw new InvalidImageError('Choose a picture to upload.');
        }
        const tataru = await this.tataru.get();
        const id = await this.profileImagesService.save(
          tataru.id,
          new Uint8Array(req.body)
        );
        const updated = await this.usersService.setImage(
          tataru.id,
          profileImageUrl(id)
        );
        const oldId = uploadedImageId(tataru.image);
        if (oldId) {
          await this.profileImagesService.delete(tataru.id, oldId);
        }
        return res.json(tataruDto(updated));
      } catch (err) {
        return next(err);
      }
    });

    return router;
  }

  private async syncStagingAccess() {
    return this.stagingAccess.sync(
      await this.usersService.stagingAccessEmails()
    );
  }
}

const requireAdmin: express.RequestHandler = (req, _res, next) =>
  next(
    req.user?.role === 'admin'
      ? undefined
      : new ForbiddenError('Only an admin can do that.')
  );

export {AdminRouter};
