import * as express from 'express';
import {config} from '../config';
import {NotFoundError} from '../errors';
import {Auth, routeParam} from '../middleware';
import {UsersService} from '../users';
import {ProfilesService} from './profiles-service';

class ProfileDto {
  readonly profile;

  constructor(
    id: string,
    username: string,
    following: boolean,
    bio?: string,
    image?: string
  ) {
    this.profile = {
      // What identifies the member in links and API paths.
      id,
      username,
      following,
      bio: bio || null,
      image: image || `${config.baseUrl}/assets/images/avatar-profile.png`,
    };
  }
}

class ProfilesRouter {
  constructor(
    private readonly auth: Auth,
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService
  ) {}

  get router() {
    const router = express.Router();

    router.post(
      '/profiles/:id/follow',
      this.auth.requireAuth,
      async (req, res, next) => {
        try {
          const follower = req.user!;

          const id = routeParam(req, 'id');

          const followee = await this.usersService.findUser(id);

          if (!followee) {
            throw new NotFoundError(`user "${id}" not found`);
          }

          await this.profilesService.followUser(follower.id, followee.id);

          const profileDto = new ProfileDto(
            followee.id,
            followee.username,
            true,
            followee.bio,
            followee.image
          );

          return res.json(profileDto);
        } catch (err) {
          return next(err);
        }
      }
    );

    router.get(
      '/profiles/:id',
      this.auth.optionalAuth,
      async (req, res, next) => {
        try {
          const id = routeParam(req, 'id');

          const followee = await this.usersService.findUser(id);

          if (!followee) {
            throw new NotFoundError(`user "${id}" not found`);
          }

          let isFollowing = false;
          if (req.user) {
            isFollowing = await this.profilesService.isFollowing(
              req.user.id,
              followee.id
            );
          }

          const profileDto = new ProfileDto(
            followee.id,
            followee.username,
            isFollowing,
            followee.bio,
            followee.image
          );

          return res.json(profileDto);
        } catch (err) {
          return next(err);
        }
      }
    );

    router.delete(
      '/profiles/:id/follow',
      this.auth.requireAuth,
      async (req, res, next) => {
        try {
          const follower = req.user!;

          const id = routeParam(req, 'id');

          const followee = await this.usersService.findUser(id);

          if (!followee) {
            throw new NotFoundError(`user "${id}" not found`);
          }

          await this.profilesService.unfollowUser(follower.id, followee.id);

          const profileDto = new ProfileDto(
            followee.id,
            followee.username,
            false,
            followee.bio,
            followee.image
          );

          return res.json(profileDto);
        } catch (err) {
          return next(err);
        }
      }
    );

    return router;
  }
}

export {ProfilesRouter};
