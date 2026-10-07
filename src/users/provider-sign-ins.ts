import {Db} from '../db';
import {AlreadyExistsError, MissingEmailError} from '../errors';
import {User} from './user';
import {
  PROVIDER_FIELDS,
  PROVIDER_NAMES,
  ProviderSignIn,
  RESERVED_USERNAMES,
  UserDoc,
  toUser,
} from './user-doc';
import type {UsersService} from './users-service';

// Sign-in with Google, Facebook, Microsoft or Discord: finding, tying or
// making the Everise account (UsersService.signInWithProvider).
class ProviderSignIns {
  private readonly usersCollection = 'users';

  constructor(
    private readonly db: Db,
    private readonly users: UsersService,
  ) {}

  // Signs in with a provider's account: the account it was tied to before,
  // else the one with the same email (tying them together from now on),
  // else a new one. `created` says which.
  async signInWithProvider(
    signIn: ProviderSignIn,
    attempt = 1,
  ): Promise<{user: User; created: boolean}> {
    const field = PROVIDER_FIELDS[signIn.provider];
    const [tied] = await this.db.find<UserDoc>(this.usersCollection, {
      where: [{field, op: '==', value: signIn.id}],
      limit: 1,
    });
    if (tied) {
      return {user: toUser(tied), created: false};
    }

    if (!signIn.email) {
      throw new MissingEmailError(PROVIDER_NAMES[signIn.provider]);
    }
    const email = signIn.email.toLowerCase();
    const sameEmail = (await this.db.find<UserDoc>(this.usersCollection)).find(
      doc => doc.email.toLowerCase() === email,
    );
    if (sameEmail) {
      if (sameEmail.system) {
        throw new AlreadyExistsError(
          'That email belongs to an account nobody can sign in to.',
        );
      }
      // The provider has confirmed the email. An account whose email wasn't
      // confirmed may have been made by someone else with this address, so
      // its password goes: the owner can set a new one in the settings.
      const unconfirmed = sameEmail.emailConfirmed === false;
      const linked = await this.db.update<UserDoc>(
        this.usersCollection,
        sameEmail.id,
        unconfirmed
          ? {[field]: signIn.id, emailConfirmed: true, passwordHash: undefined}
          : {[field]: signIn.id},
      );
      return {user: toUser(linked!), created: false};
    }

    const userDoc = await this.db.createUnique<UserDoc>(
      this.usersCollection,
      {
        email,
        username: await this.freeUsername(signIn.name, email),
        [field]: signIn.id,
      },
      [['email'], ['username'], [field]],
    );
    // Another request made the account meanwhile: sign in to that one.
    if (!userDoc && attempt < 3) {
      return this.signInWithProvider(signIn, attempt + 1);
    }
    if (!userDoc) {
      throw new AlreadyExistsError('That account was just taken. Try again.');
    }
    return {user: toUser(userDoc), created: true};
  }

  // A username for a new account made through a provider: the person's
  // name without spaces or symbols (else their email's first part), with a
  // number added when it's taken. They can change it in Settings.
  private async freeUsername(name: string | undefined, email: string) {
    const tidy = (text: string) =>
      text.replace(/[^\p{L}\p{N}._-]/gu, '').slice(0, 30);
    const base = tidy(name ?? '') || tidy(email.split('@')[0]) || 'adventurer';
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? base : `${base}${n}`;
      if (
        !RESERVED_USERNAMES.includes(candidate.toLowerCase()) &&
        !(await this.users.getUserByUsername(candidate))
      ) {
        return candidate;
      }
    }
  }
}

export {ProviderSignIns};
