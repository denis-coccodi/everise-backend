import {z} from 'zod';
import {responseSchema} from '../api';

// A member as others see them, or a Waking Sands character as a post's
// author.
const ProfileSchema = responseSchema(
  'Profile',
  z.strictObject({
    // What identifies the member in links and API paths.
    id: z.string(),
    username: z.string(),
    // A member's character in the game and its world, both or neither, and
    // what the site calls them: "Avar Kriss (Odin)", or their username (a
    // Waking Sands character's name).
    characterName: z.string().nullable(),
    server: z.string().nullable(),
    displayName: z.string(),
    // Whether the signed-in user follows them (false for guests).
    following: z.boolean(),
    bio: z.string().nullable(),
    // Their picture's address; a default one when they have none.
    image: z.string(),
    // Only on a Waking Sands character's profile (id `character:<id>`): the
    // character's id. Not a member: nobody signs in as them or follows them,
    // and only admins change them. `username` is their name.
    character: z.string().optional(),
  }),
);

const ProfileResponse = responseSchema(
  'ProfileResponse',
  z.strictObject({profile: ProfileSchema}),
);

export {ProfileResponse, ProfileSchema};
