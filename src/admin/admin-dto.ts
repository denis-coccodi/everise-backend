import {config} from '../config';
import {InvalidImageError} from '../errors';
import {User} from '../users';

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
    // How they sign in, e.g. ["google"] for an account made with Google.
    signInMethods: user.signInMethods,
    // False for a sign-up whose email link hasn't been opened yet.
    emailConfirmed: user.emailConfirmed,
  };
}

// A file as the body: the checks every upload gets.
function uploadedFile(body: unknown) {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new InvalidImageError('Choose a picture to upload.');
  }
  return new Uint8Array(body);
}

export {memberDto, uploadedFile};
