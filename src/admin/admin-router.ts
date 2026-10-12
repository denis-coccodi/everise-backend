import * as express from 'express';
import {route} from '../api';
import {Auth} from '../middleware';
import {UsersService, readImageBody} from '../users';
import {CharacterParams, CharactersService} from '../waking-sands';
import {memberDto, uploadedFile} from './admin-dtos';
import {
  AdminCharacterResponse,
  AdminCharactersResponse,
  CHARACTER_LIMITS,
  CharacterUpdate,
  MemberDeletionResponse,
  MembersQuery,
  MembersResponse,
  RoleChange,
  RoleChangeResponse,
  StagingAccessResponse,
} from './admin-schemas';
import {MemberDeletion} from './member-deletion';
import {StagingAccess} from './staging-access';

// The admin's tools, all under /api/admin and only for admins (ADMIN_EMAILS):
// members and their roles (a staging tester may open the staging site, kept
// in Cloudflare Access by StagingAccess), and the Waking Sands characters
// (Tataru among them, who posts guests' roulette results).
class AdminRouter {
  constructor(
    private readonly auth: Auth,
    private readonly usersService: UsersService,
    private readonly stagingAccess: StagingAccess,
    private readonly memberDeletion: MemberDeletion,
    private readonly characters: CharactersService,
  ) {}

  get router() {
    const router = express.Router();
    const auth = this.auth.admin;

    // A page of members, optionally only those whose username or email
    // contains `search`; `usersCount` is how many match in all.
    route(
      router,
      {
        method: 'get',
        path: '/admin/users',
        summary: 'Find members',
        auth,
        query: MembersQuery,
        responses: {200: {description: 'A page.', schema: MembersResponse}},
      },
      async (req, res) => {
        const {search, limit, offset} = req.query;
        const {users, count} = await this.usersService.searchMembers(
          search,
          limit,
          offset,
        );
        res.json({
          users: users.map(memberDto),
          usersCount: count,
          stagingAccessConnected: this.stagingAccess.connected,
        });
      },
    );

    route(
      router,
      {
        method: 'put',
        path: '/admin/users/:id/role',
        summary: "Change a member's role",
        auth,
        body: RoleChange,
        responses: {
          200: {description: 'The member.', schema: RoleChangeResponse},
        },
      },
      async (req, res) => {
        const user = await this.usersService.setRole(
          req.params.id,
          req.body.role,
        );
        const stagingAccess = await this.syncStagingAccess();
        res.json({user: memberDto(user), stagingAccess});
      },
    );

    // Deletes a member and everything they posted, for good (the privacy
    // policy's "Deleting your data"). Admins can't be.
    route(
      router,
      {
        method: 'delete',
        path: '/admin/users/:id',
        summary: 'Delete a member and everything they posted',
        auth,
        responses: {
          200: {description: 'What went.', schema: MemberDeletionResponse},
        },
      },
      async (req, res) => {
        const deleted = await this.memberDeletion.delete(req.params.id);
        // A deleted staging tester loses staging access too.
        const stagingAccess = deleted.wasStagingTester
          ? await this.syncStagingAccess()
          : undefined;
        res.json({
          deleted: {
            username: deleted.username,
            articles: deleted.articles,
            comments: deleted.comments,
          },
          stagingAccess,
        });
      },
    );

    // Writes the staging testers to Cloudflare Access again, e.g. after
    // setting it up or after a failed sync.
    route(
      router,
      {
        method: 'post',
        path: '/admin/staging-access',
        summary: 'Write the staging testers to Cloudflare Access again',
        auth,
        responses: {
          200: {description: 'The result.', schema: StagingAccessResponse},
        },
      },
      async (_req, res) => {
        res.json({stagingAccess: await this.syncStagingAccess()});
      },
    );

    // The Waking Sands characters as admins edit them: title, personality
    // (with the default, to go back to) and picture.
    route(
      router,
      {
        method: 'get',
        path: '/admin/characters',
        summary: 'The Waking Sands characters, as admins edit them',
        auth,
        responses: {
          200: {description: 'Them all.', schema: AdminCharactersResponse},
        },
      },
      async (_req, res) => {
        res.json({
          characters: await this.characters.all(),
          limits: CHARACTER_LIMITS,
        });
      },
    );

    const characterResponses = {
      200: {description: 'The character.', schema: AdminCharacterResponse},
    };

    // Changes a character; an empty title or personality goes back to the
    // default.
    route(
      router,
      {
        method: 'put',
        path: '/admin/characters/:id',
        summary: 'Change a character',
        auth,
        params: CharacterParams,
        body: CharacterUpdate,
        responses: characterResponses,
      },
      async (req, res) => {
        const character = await this.characters.update(
          req.params.id,
          req.body.character,
        );
        res.json({character});
      },
    );

    // A new picture for a character: the file as the request body, with the
    // same checks as anyone's upload.
    route(
      router,
      {
        method: 'put',
        path: '/admin/characters/:id/image',
        summary: "Upload a character's picture (the file as the body)",
        auth,
        bodyType: 'image',
        responses: characterResponses,
      },
      readImageBody,
      async (req, res) => {
        const character = await this.characters.setPicture(
          req.params.id,
          uploadedFile(req.body),
        );
        res.json({character});
      },
    );

    return router;
  }

  private async syncStagingAccess() {
    return this.stagingAccess.sync(
      await this.usersService.stagingAccessEmails(),
    );
  }
}

export {AdminRouter};
