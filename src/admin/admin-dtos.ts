import {z} from 'zod';
import {config} from '../config';
import {InvalidImageError} from '../errors';
import {User} from '../users';
import {CHARACTERS} from '../waking-sands';

// What the admin routes answer with, and the checks they share.

// The picture shown for someone who hasn't uploaded one, as in UserDto.
const pictureOf = (user: User) =>
  user.image || `${config.baseUrl}/assets/images/avatar-profile.png`;

// A member as the admin's list shows them.
function memberDto(user: User) {
  return {
    id: user.id,
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

const CharacterParams = z.object({
  id: z.string().refine(id => CHARACTERS.some(c => c.id === id), {
    error: 'There is no such character.',
  }),
});

// A file as the body: the checks every upload gets.
function uploadedFile(body: unknown) {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new InvalidImageError('Choose a picture to upload.');
  }
  return new Uint8Array(body);
}

export {CharacterParams, memberDto, tataruDto, uploadedFile};
