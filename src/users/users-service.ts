import {randomBytes} from 'crypto';
import {config} from '../config';
import {Db} from '../db';
import {AlreadyExistsError, InvalidRoleError, NotFoundError} from '../errors';
import {AssignableRole, User} from './user';
import {
  UpdateUserParams,
  UserDoc,
  SystemUserParams,
  ProviderSignIn,
  RESERVED_USERNAMES,
  isAdminEmail,
  toUser,
} from './user-doc';
import {checkNewPassword, hashPassword, passwordMatches} from './passwords';
import {ProviderSignIns} from './provider-sign-ins';

// How long an unconfirmed sign-up keeps its username.
const UNCONFIRMED_DAYS = 7;

class UsersService {
  private readonly usersCollection = 'users';

  constructor(private readonly db: Db) {}

  // A new account. With `confirmed` false it can't be signed in to until its
  // email is confirmed; until then a new sign-up with the same email
  // replaces it (whoever made it may not own the address), and after
  // UNCONFIRMED_DAYS its username is free again.
  async registerUser(
    email: string,
    username: string,
    password: string,
    confirmed = true,
  ): Promise<User> {
    await this.removeUnconfirmed(email);

    await this.validateEmailOrThrow(email);

    await this.validateUsernameOrThrow(username);

    checkNewPassword(password);

    const passwordHash = await hashPassword(password);

    const userData = {
      email,
      username,
      passwordHash,
      ...(confirmed ? {} : {emailConfirmed: false}),
    };

    // Checked above for the messages, and again as it's created: two
    // sign-ups at once can't both take the address or the name.
    const userDoc = await this.db.createUnique<UserDoc>(
      this.usersCollection,
      userData,
      [['email'], ['username']],
    );
    if (!userDoc) {
      throw new AlreadyExistsError(
        'That email address or username was just taken. Try again.',
      );
    }

    return toUser(userDoc);
  }

  // Signs in with a provider's account (see ProviderSignIns).
  async signInWithProvider(signIn: ProviderSignIn) {
    return new ProviderSignIns(this.db, this).signInWithProvider(signIn);
  }

  async getUserById(userId: string): Promise<User | undefined> {
    const userDoc = await this.db.get<UserDoc>(this.usersCollection, userId);

    return userDoc && toUser(userDoc);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const userDoc = await this.findUserDoc('email', email);

    return userDoc && toUser(userDoc);
  }

  // A member by id, or by the username in a link from before profiles had
  // ids in their links (a username can change, an id can't).
  async findUser(key: string): Promise<User | undefined> {
    return (await this.getUserById(key)) ?? (await this.getUserByUsername(key));
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const userDoc = await this.findUserDoc('username', username);

    return userDoc && toUser(userDoc);
  }

  // With `confirmNewEmail`, a new email address waits as pendingEmail until
  // its link is opened (see confirmEmail); otherwise it's used at once.
  async updateUser(
    userId: string,
    params: UpdateUserParams,
    {confirmNewEmail = false} = {},
  ): Promise<User> {
    const userData = await this.db.get<UserDoc>(this.usersCollection, userId);

    if (!userData) {
      throw new NotFoundError(`user "${userId}" not found`);
    }

    if (params.email && params.email !== userData.email) {
      await this.validateEmailOrThrow(params.email);
      if (confirmNewEmail) {
        userData.pendingEmail = params.email;
      } else {
        userData.email = params.email;
      }
    } else if (params.email === userData.email) {
      // Back to the current address: nothing waits any more.
      userData.pendingEmail = undefined;
    }

    if (params.username && params.username !== userData.username) {
      await this.validateUsernameOrThrow(params.username);
      userData.username = params.username;
    }

    if (params.password) {
      checkNewPassword(params.password);
      const passwordHash = await hashPassword(params.password);
      userData.passwordHash = passwordHash;
    }

    if (params.bio !== undefined && params.bio !== userData.bio) {
      userData.bio = params.bio ?? '';
    }

    if (params.darkMode !== undefined) {
      userData.darkMode = params.darkMode;
    }

    if (params.image && params.image !== userData.image) {
      userData.image = params.image;
    }

    const updatedData = await this.db.update<UserDoc>(
      this.usersCollection,
      userId,
      {
        email: userData.email,
        pendingEmail: userData.pendingEmail,
        username: userData.username,
        passwordHash: userData.passwordHash,
        bio: userData.bio,
        image: userData.image,
        darkMode: userData.darkMode,
      },
    );

    return toUser(updatedData!);
  }

  // A confirmation link for `email` was opened: the account's own address
  // is confirmed, or the new address it was changing to takes over.
  async confirmEmail(userId: string, email: string): Promise<User> {
    const doc = await this.db.get<UserDoc>(this.usersCollection, userId);
    if (doc && doc.pendingEmail === email) {
      // Someone may have taken the address since it was asked for.
      await this.validateEmailOrThrow(email);
      const updated = await this.db.update<UserDoc>(
        this.usersCollection,
        userId,
        {email, pendingEmail: undefined, emailConfirmed: true},
      );
      return toUser(updated!);
    }
    if (doc && doc.email === email) {
      const updated = await this.db.update<UserDoc>(
        this.usersCollection,
        userId,
        {emailConfirmed: true},
      );
      return toUser(updated!);
    }
    throw new RangeError(
      'This link is for an email address the account no longer uses.',
    );
  }

  // Sets the user's picture to a stored upload's URL, or back to the default
  // with undefined. Not validated like a user-entered URL: the app makes it.
  async setImage(userId: string, image: string | undefined): Promise<User> {
    const updated = await this.db.update<UserDoc>(
      this.usersCollection,
      userId,
      {
        image,
      },
    );

    if (!updated) {
      throw new NotFoundError(`user "${userId}" not found`);
    }

    return toUser(updated);
  }

  // The system account with this username, created on first use.
  async getOrCreateSystemUser(params: SystemUserParams): Promise<User> {
    const existing = await this.findUserDoc('username', params.username);
    if (existing?.system) {
      return toUser(existing);
    }
    // A person registered the name before it was reserved: the system
    // account takes a longer one.
    const username = existing
      ? `${params.username} (Everise)`
      : params.username;

    const userDoc = await this.db.create<UserDoc>(this.usersCollection, {
      ...params,
      username,
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
      system: true,
    });

    return toUser(userDoc);
  }

  async verifyPassword(email: string, password: string): Promise<boolean> {
    const userDoc = await this.findUserDoc('email', email);

    if (!userDoc) {
      throw new NotFoundError('"email" not found');
    }

    // Someone who signed up through a provider has no password.
    if (!userDoc.passwordHash) {
      return false;
    }

    return await passwordMatches(password, userDoc.passwordHash);
  }

  // Everyone who registered, without the system accounts, by username.
  async listMembers(): Promise<User[]> {
    const docs = await this.db.find<UserDoc>(this.usersCollection);
    return docs
      .filter(doc => !doc.system)
      .map(toUser)
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  // A page of members whose username or email contains `search` (any
  // case), by username, with how many match in all.
  async searchMembers(search: string, limit: number, offset: number) {
    const term = search.trim().toLowerCase();
    const matches = (await this.listMembers()).filter(
      user =>
        !term ||
        user.username.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term),
    );
    return {
      users: matches.slice(offset, offset + limit),
      count: matches.length,
    };
  }

  // Gives a member a role. Admins come from the configuration, and system
  // accounts have none.
  async setRole(key: string, role: AssignableRole): Promise<User> {
    const found = await this.findUser(key);
    const doc =
      found && (await this.db.get<UserDoc>(this.usersCollection, found.id));
    if (!doc || doc.system) {
      throw new NotFoundError(`user "${key}" not found`);
    }
    if (isAdminEmail(doc.email)) {
      throw new InvalidRoleError(
        `${doc.username} is an admin. Admins are set in the backend's ADMIN_EMAILS setting.`,
      );
    }

    const updated = await this.db.update<UserDoc>(
      this.usersCollection,
      doc.id,
      {
        role,
      },
    );
    return toUser(updated!);
  }

  // Who may open the staging site: the admins and the staging testers.
  async stagingAccessEmails(): Promise<string[]> {
    const testers = (await this.listMembers())
      .filter(user => user.role === 'staging-tester')
      .map(user => user.email.toLowerCase());
    return [...new Set([...config.adminEmails, ...testers])].sort();
  }

  // Unconfirmed sign-ups with this email, and any older than
  // UNCONFIRMED_DAYS: nobody could sign in to them, and they would keep the
  // email or username from someone else.
  private async removeUnconfirmed(email: string) {
    const cutoff = Date.now() - UNCONFIRMED_DAYS * 24 * 60 * 60 * 1000;
    const stale = (
      await this.db.find<UserDoc>(this.usersCollection, {
        where: [{field: 'emailConfirmed', op: '==', value: false}],
      })
    ).filter(
      doc =>
        doc.email.toLowerCase() === email.toLowerCase() ||
        new Date(doc.createdAt).getTime() < cutoff,
    );
    for (const doc of stale) {
      await this.db.delete(this.usersCollection, doc.id);
    }
  }

  private async findUserDoc(field: 'email' | 'username', value: string) {
    const [userDoc] = await this.db.find<UserDoc>(this.usersCollection, {
      where: [{field, op: '==', value}],
      limit: 1,
    });

    return userDoc as UserDoc | undefined;
  }

  private async validateEmailOrThrow(email: string) {
    if (await this.getUserByEmail(email)) {
      throw new AlreadyExistsError(
        'That email address is already registered. Sign in instead?',
      );
    }
  }

  private async validateUsernameOrThrow(username: string) {
    if (
      RESERVED_USERNAMES.includes(username.trim().toLowerCase()) ||
      (await this.getUserByUsername(username))
    ) {
      throw new AlreadyExistsError('That username is taken. Try another one.');
    }
  }
}

export {ProviderSignIn, UsersService};
