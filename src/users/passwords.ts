import * as bcrypt from 'bcryptjs';

// The rules for a new password, and how passwords are kept: bcrypt hashes.
// Cost 8: each step up doubles the CPU of every sign-in, and a Worker on
// the free plan has 10 ms of CPU per request (cost 8 already takes more).

// bcrypt reads only the first 72 bytes: anything after would be ignored.
const MAX_PASSWORD_BYTES = 72;

// Only new passwords: existing ones sign in as they are.
function checkNewPassword(password: string) {
  if (password.length < 8) {
    throw new RangeError('Your password needs at least 8 characters.');
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    throw new RangeError('Keep your password to 72 characters or fewer.');
  }
}

function hashPassword(password: string) {
  return bcrypt.hash(password, 8);
}

function passwordMatches(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export {checkNewPassword, hashPassword, passwordMatches};
