import * as bcrypt from 'bcryptjs';

// The rule for a new password, and how passwords are kept: bcrypt hashes.

function checkNewPassword(password: string) {
  if (password.length < 8) {
    throw new RangeError('Your password needs at least 8 characters.');
  }
}

function hashPassword(password: string) {
  return bcrypt.hash(password, 8);
}

function passwordMatches(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export {checkNewPassword, hashPassword, passwordMatches};
