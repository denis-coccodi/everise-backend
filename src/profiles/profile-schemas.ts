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
    // Whether the signed-in user follows them (false for guests).
    following: z.boolean(),
    bio: z.string().nullable(),
    // Their picture's address; a default one when they have none.
    image: z.string(),
    // Only on a Waking Sands character (Tataru, who posts guests' roulette
    // results): the character's id. Not a member: no profile page, and
    // nobody follows them. `username` is their name, `bio` their title.
    character: z.string().optional(),
  }),
);

const ProfileResponse = responseSchema(
  'ProfileResponse',
  z.strictObject({profile: ProfileSchema}),
);

export {ProfileResponse, ProfileSchema};
