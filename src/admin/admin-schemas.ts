import {z} from 'zod';
import {requestSchema, responseSchema} from '../api';
import {ASSIGNABLE_ROLES} from '../users';
import {bio} from '../users/user-fields';

// How long a character's personality may be: room for a detailed one, while
// keeping each reply's prompt (and its Neurons) small.
const MAX_PERSONA_LENGTH = 4000;

// A member as the admin's list shows them.
const Member = responseSchema(
  'Member',
  z.strictObject({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    image: z.string(),
    role: z.enum(['admin', 'staging-tester', 'user']),
  }),
);

// Whether the staging Access list was written, and what happened.
const StagingAccessSync = responseSchema(
  'StagingAccessSync',
  z.strictObject({synced: z.boolean(), message: z.string()}),
);

const MembersQuery = z.object({
  // Only members whose username or email contains this.
  search: z.string().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const MembersResponse = responseSchema(
  'MembersResponse',
  z.strictObject({
    users: z.array(Member),
    // How many match in all.
    usersCount: z.number().int(),
    // Whether role changes reach the staging Access list.
    stagingAccessConnected: z.boolean(),
  }),
);

const RoleChange = requestSchema(
  'RoleChange',
  z.object({
    role: z.enum(ASSIGNABLE_ROLES, {
      error: issue =>
        issue.input === undefined
          ? 'Choose a role.'
          : 'Choose "user" or "staging-tester".',
    }),
  }),
);

const RoleChangeResponse = responseSchema(
  'RoleChangeResponse',
  z.strictObject({user: Member, stagingAccess: StagingAccessSync}),
);

const MemberDeletionResponse = responseSchema(
  'MemberDeletionResponse',
  z.strictObject({
    deleted: z.strictObject({
      username: z.string(),
      // How many of their posts and comments went with them.
      articles: z.number().int(),
      comments: z.number().int(),
    }),
    // Only when they were a staging tester.
    stagingAccess: StagingAccessSync.optional(),
  }),
);

const StagingAccessResponse = responseSchema(
  'StagingAccessResponse',
  z.strictObject({stagingAccess: StagingAccessSync}),
);

const TataruResponse = responseSchema(
  'TataruResponse',
  z.strictObject({
    tataru: z.strictObject({
      username: z.string(),
      bio: z.string().nullable(),
      image: z.string(),
    }),
  }),
);

const TataruUpdate = requestSchema(
  'TataruUpdate',
  z.object({tataru: z.object({bio: bio().optional()})}),
);

// A Waking Sands character as admins edit it: the default with their
// changes. `edited` says which fields differ from the default.
const AdminCharacter = responseSchema(
  'AdminCharacter',
  z.strictObject({
    id: z.string(),
    name: z.string(),
    title: z.string(),
    persona: z.string(),
    defaultPersona: z.string(),
    image: z.string().optional(),
    // Only Tataru has a bio: she is also the account that posts guests'
    // results.
    bio: z.string().nullable().optional(),
    edited: z.strictObject({title: z.boolean(), persona: z.boolean()}),
  }),
);

const AdminCharactersResponse = responseSchema(
  'AdminCharactersResponse',
  z.strictObject({characters: z.array(AdminCharacter)}),
);

const AdminCharacterResponse = responseSchema(
  'AdminCharacterResponse',
  z.strictObject({character: AdminCharacter}),
);

// An empty title or personality goes back to the default.
const CharacterUpdate = requestSchema(
  'CharacterUpdate',
  z.object({
    character: z.object({
      title: z.string().trim().max(80).nullable().optional(),
      persona: z.string().max(MAX_PERSONA_LENGTH).nullable().optional(),
      bio: bio().optional(),
    }),
  }),
);

export {
  AdminCharacterResponse,
  AdminCharactersResponse,
  CharacterUpdate,
  MemberDeletionResponse,
  MembersQuery,
  MembersResponse,
  RoleChange,
  RoleChangeResponse,
  StagingAccessResponse,
  TataruResponse,
  TataruUpdate,
};
