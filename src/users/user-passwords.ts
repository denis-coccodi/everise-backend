import {Db} from '../db';
import {NotFoundError} from '../errors';
import {checkNewPassword, hashPassword, passwordMatches} from './passwords';
import {User} from './user';
import {UserDoc, toUser} from './user-doc';

// Changing a password: from the settings with the current one, or with a
// code from a password reset email. Either signs the account out of every
// other device, as does "sign out everywhere".
class UserPasswords {
  private readonly collection = 'users';

  constructor(private readonly db: Db) {}

  // Before the settings change the password (`newPassword`) or the email
  // address, so nothing is saved when they can't: the current password,
  // when the account has one. One made with a provider has none to ask
  // for; it sets its first password with a reset code, which proves the
  // email address is theirs.
  async checkCurrent(
    userId: string,
    currentPassword: string | undefined,
    newPassword?: string,
  ) {
    const doc = await this.doc(userId);
    if (newPassword !== undefined) {
      if (!doc.passwordHash) {
        throw new RangeError(
          'Your account has no password yet. Use "Forgot password?" on the sign-in page to get a code by email and set one.',
        );
      }
      checkNewPassword(newPassword);
    }
    if (!doc.passwordHash) return;
    if (!currentPassword) {
      throw new RangeError('Enter your current password.');
    }
    if (!(await passwordMatches(currentPassword, doc.passwordHash))) {
      throw new RangeError('Your current password is wrong.');
    }
  }

  // A new password: from the settings once checkCurrent has passed, or
  // with a reset code. Signs out everywhere.
  async set(userId: string, password: string): Promise<User> {
    checkNewPassword(password);
    const passwordHash = await hashPassword(password);
    await this.db.update<UserDoc>(this.collection, userId, {passwordHash});
    return this.signOutEverywhere(userId);
  }

  // Ends every session: tokens made before no longer sign in.
  async signOutEverywhere(userId: string): Promise<User> {
    await this.doc(userId);
    const doc = await this.db.increment<UserDoc>(this.collection, userId, {
      sessionVersion: 1,
    });
    return toUser(doc);
  }

  private async doc(userId: string) {
    const doc = await this.db.get<UserDoc>(this.collection, userId);
    if (!doc) throw new NotFoundError(`user "${userId}" not found`);
    return doc;
  }
}

export {UserPasswords};
