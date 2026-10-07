import {z} from 'zod';
import {responseSchema} from '../api';

// A member as others see them.
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
  }),
);

const ProfileResponse = responseSchema(
  'ProfileResponse',
  z.strictObject({profile: ProfileSchema}),
);

export {ProfileResponse, ProfileSchema};
