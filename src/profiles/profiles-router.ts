import * as express from 'express';
import {route} from '../api';
import {config} from '../config';
import {NotFoundError} from '../errors';
import {Auth} from '../middleware';
import {User, UsersService} from '../users';
import {ProfileResponse} from './profile-schemas';
import {ProfilesService} from './profiles-service';

function profileBody(member: User, following: boolean) {
  return {
    profile: {
      id: member.id,
      username: member.username,
      following,
      bio: member.bio || null,
      image:
        member.image || `${config.baseUrl}/assets/images/avatar-profile.png`,
    },
  };
}

class ProfilesRouter {
  constructor(
    private readonly auth: Auth,
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
  ) {}

  private async requireMember(id: string) {
    const member = await this.usersService.findUser(id);
    if (!member) throw new NotFoundError(`user "${id}" not found`);
    return member;
  }

  get router() {
    const router = express.Router();
    const responses = {
      200: {description: 'The member.', schema: ProfileResponse},
    };

    route(
      router,
      {
        method: 'post',
        path: '/profiles/:id/follow',
        summary: 'Follow a member',
        auth: this.auth.required,
        responses,
      },
      async (req, res) => {
        const followee = await this.requireMember(req.params.id);
        await this.profilesService.followUser(req.user!.id, followee.id);
        res.json(profileBody(followee, true));
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/profiles/:id',
        summary: "A member's profile",
        auth: this.auth.optional,
        responses,
      },
      async (req, res) => {
        const member = await this.requireMember(req.params.id);
        const following = req.user
          ? await this.profilesService.isFollowing(req.user.id, member.id)
          : false;
        res.json(profileBody(member, following));
      },
    );

    route(
      router,
      {
        method: 'delete',
        path: '/profiles/:id/follow',
        summary: 'Stop following a member',
        auth: this.auth.required,
        responses,
      },
      async (req, res) => {
        const followee = await this.requireMember(req.params.id);
        await this.profilesService.unfollowUser(req.user!.id, followee.id);
        res.json(profileBody(followee, false));
      },
    );

    return router;
  }
}

export {ProfilesRouter};
