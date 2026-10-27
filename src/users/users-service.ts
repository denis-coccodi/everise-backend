import {config} from '../config';
import {Db} from '../db';
import {AlreadyExistsError, InvalidRoleError, NotFoundError} from '../errors';
import {checkCharacter} from './character-name';
import {User} from './user';
import {RESERVED_USERNAMES, isAdminEmail, toUser} from './user-doc';
import {LeakedPasswords} from './leaked-passwords';
import {checkNewPassword, hashPassword, passwordMatches} from './passwords';
import {ProviderSignIns} from './provider-sign-ins';
import {UpdateUserParams, UserDoc, ProviderSignIn} from './user-model';
import {AssignableRole} from './user-model';

// How long an unconfirmed sign-up keeps its username.
const UNCONFIRMED_DAYS = 7;

function sameEmail(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

class UsersService {
  private readonly usersCollection = 'users';

  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
    // Without it (local runs, most tests), leaks aren't checked.
    private readonly leaked?: LeakedPasswords,
  ) {}

  // A new account. With `confirmed` false it can't be signed in to until its
  // email is confirmed; until then a new sign-up with the same email
  // replaces it (whoever made it may not own the address), and after
  // UNCONFIRMED_DAYS its username is free again.
  async registerUser(
    email: string,
    username: string,
    password: string,
    confirmed = true,
    character: {characterName?: string | null; server?: string | null} = {},
  ): Promise<User> {
    checkCharacter(character);
    await this.removeUnconfirmed(email);

    await this.validateEmailOrThrow(email);

    await this.validateUsernameOrThrow(username);

    checkNewPassword(password);
    await this.leaked?.check(password);

    const passwordHash = await hashPassword(password);

    const userData = {
      email,
      username,
      ...(character.characterName && character.server
        ? {characterName: character.characterName, server: character.server}
        : {}),
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

    if (params.email && !sameEmail(params.email, userData.email)) {
      await this.validateEmailOrThrow(params.email);
      if (confirmNewEmail) {
        userData.pendingEmail = params.email;
      } else {
        userData.email = params.email;
      }
    } else if (params.email) {
      // Back to the current address: nothing waits any more.
      userData.pendingEmail = undefined;
    }

    if (params.username && params.username !== userData.username) {
      await this.validateUsernameOrThrow(params.username);
      userData.username = params.username;
    }

    // Both or neither, as the account will have them.
    const character = {
      characterName:
        params.characterName === undefined
          ? userData.characterName
          : (params.characterName ?? undefined),
      server:
        params.server === undefined
          ? userData.server
          : (params.server ?? undefined),
    };
    checkCharacter(character);
    userData.characterName = character.characterName;
    userData.server = character.server;

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
        characterName: userData.characterName,
        server: userData.server,
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

  // Everyone who registered, by username.
  async listMembers(): Promise<User[]> {
    const docs = await this.db.find<UserDoc>(this.usersCollection);
    return docs
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

  // Gives a member a role. Admins come from the configuration.
  async setRole(key: string, role: AssignableRole): Promise<User> {
    const found = await this.findUser(key);
    const doc =
      found && (await this.db.get<UserDoc>(this.usersCollection, found.id));
    if (!doc) {
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
    const cutoff =
      this.now().getTime() - UNCONFIRMED_DAYS * 24 * 60 * 60 * 1000;
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

  // An email address is found in any case (Name@… is name@…): exactly as
  // typed first, then by looking through everyone.
  private async findUserDoc(field: 'email' | 'username', value: string) {
    const [userDoc] = await this.db.find<UserDoc>(this.usersCollection, {
      where: [{field, op: '==', value}],
      limit: 1,
    });
    if (userDoc || field !== 'email') return userDoc as UserDoc | undefined;

    const everyone = await this.db.find<UserDoc>(this.usersCollection);
    return everyone.find(doc => sameEmail(doc.email, value));
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
