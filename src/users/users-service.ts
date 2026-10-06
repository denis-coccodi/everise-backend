import * as bcrypt from 'bcryptjs';
import {randomBytes} from 'crypto';
import {Joi} from 'celebrate';
import {config} from '../config';
import {Db, Doc} from '../db';
import {
  AlreadyExistsError,
  InvalidRoleError,
  MissingEmailError,
  NotFoundError,
} from '../errors';
import {AssignableRole, Role, SignInMethod, User} from './user';

interface UpdateUserParams {
  email?: string;
  username?: string;
  password?: string;
  bio?: string | null;
  image?: string;
  darkMode?: boolean;
}

interface UserDoc extends Doc {
  email: string;
  username: string;
  // Unset for someone who only ever signed in with a provider (Google,
  // Facebook, Microsoft, Discord).
  passwordHash?: string;
  // The provider accounts that sign in to this one, by the provider's id for
  // the person.
  googleId?: string;
  facebookId?: string;
  microsoftId?: string;
  discordId?: string;
  bio?: string;
  image?: string;
  darkMode?: boolean;
  // Given by an admin; admins themselves come from ADMIN_EMAILS.
  role?: AssignableRole;
  // An account the app posts as, e.g. Tataru for guests. Nobody can sign in
  // as it: its password is random and never stored anywhere else.
  system?: boolean;
}

interface SystemUserParams {
  username: string;
  email: string;
  bio: string;
  image?: string;
}

// Someone signing in with a provider, as the provider vouches for them;
// email is only set when the provider confirmed it.
interface ProviderSignIn {
  provider: SignInProvider;
  id: string;
  email?: string;
  name?: string;
}

type SignInProvider = Exclude<SignInMethod, 'password'>;

const PROVIDER_FIELDS = {
  google: 'googleId',
  facebook: 'facebookId',
  microsoft: 'microsoftId',
  discord: 'discordId',
} as const;
const PROVIDER_NAMES = {
  google: 'Google',
  facebook: 'Facebook',
  microsoft: 'Microsoft',
  discord: 'Discord',
} as const;

// Usernames kept for system accounts, compared without case.
const RESERVED_USERNAMES = ['tataru'];

function isAdminEmail(email: string) {
  return config.adminEmails.includes(email.toLowerCase());
}

function roleOf(doc: UserDoc): Role {
  if (doc.system) return 'user';
  return isAdminEmail(doc.email) ? 'admin' : doc.role ?? 'user';
}

function signInMethodsOf(doc: UserDoc): SignInMethod[] {
  const methods: SignInMethod[] = [];
  if (doc.passwordHash) methods.push('password');
  for (const [provider, field] of Object.entries(PROVIDER_FIELDS)) {
    if (doc[field]) methods.push(provider as SignInProvider);
  }
  return methods;
}

function toUser(doc: UserDoc): User {
  return new User(
    doc.id,
    doc.email,
    doc.username,
    doc.bio,
    doc.image,
    doc.darkMode,
    roleOf(doc),
    !!doc.system,
    signInMethodsOf(doc)
  );
}

class UsersService {
  private readonly usersCollection = 'users';

  constructor(private readonly db: Db) {}

  async registerUser(
    email: string,
    username: string,
    password: string
  ): Promise<User> {
    await this.validateEmailOrThrow(email);

    await this.validateUsernameOrThrow(username);

    await this.validatePasswordOrThrow(password);

    const passwordHash = await this.hashPassword(password);

    const userData = {
      email,
      username,
      passwordHash,
    };

    const userDoc = await this.db.create<UserDoc>(
      this.usersCollection,
      userData
    );

    return toUser(userDoc);
  }

  // Signs in with a provider's account: the account it was tied to before,
  // else the one with the same email (tying them together from now on),
  // else a new one. `created` says which.
  async signInWithProvider(
    signIn: ProviderSignIn
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
      doc => doc.email.toLowerCase() === email
    );
    if (sameEmail) {
      if (sameEmail.system) {
        throw new AlreadyExistsError(
          'That email belongs to an account nobody can sign in to.'
        );
      }
      const linked = await this.db.update<UserDoc>(
        this.usersCollection,
        sameEmail.id,
        {[field]: signIn.id}
      );
      return {user: toUser(linked!), created: false};
    }

    const userDoc = await this.db.create<UserDoc>(this.usersCollection, {
      email,
      username: await this.freeUsername(signIn.name, email),
      [field]: signIn.id,
    });
    return {user: toUser(userDoc), created: true};
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

  async updateUser(userId: string, params: UpdateUserParams): Promise<User> {
    const userData = await this.db.get<UserDoc>(this.usersCollection, userId);

    if (!userData) {
      throw new NotFoundError(`user "${userId}" not found`);
    }

    if (params.email && params.email !== userData.email) {
      await this.validateEmailOrThrow(params.email);
      userData.email = params.email;
    }

    if (params.username && params.username !== userData.username) {
      await this.validateUsernameOrThrow(params.username);
      userData.username = params.username;
    }

    if (params.password) {
      await this.validatePasswordOrThrow(params.password);
      const passwordHash = await this.hashPassword(params.password);
      userData.passwordHash = passwordHash;
    }

    if (params.bio !== undefined && params.bio !== userData.bio) {
      userData.bio = params.bio ?? '';
    }

    if (params.darkMode !== undefined) {
      userData.darkMode = params.darkMode;
    }

    if (params.image && params.image !== userData.image) {
      await this.validateImageOrThrow(params.image);
      userData.image = params.image;
    }

    const updatedData = await this.db.update<UserDoc>(
      this.usersCollection,
      userId,
      {
        email: userData.email,
        username: userData.username,
        passwordHash: userData.passwordHash,
        bio: userData.bio,
        image: userData.image,
        darkMode: userData.darkMode,
      }
    );

    return toUser(updatedData!);
  }

  // Sets the user's picture to a stored upload's URL, or back to the default
  // with undefined. Not validated like a user-entered URL: the app makes it.
  async setImage(userId: string, image: string | undefined): Promise<User> {
    const updated = await this.db.update<UserDoc>(
      this.usersCollection,
      userId,
      {
        image,
      }
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
      passwordHash: await this.hashPassword(randomBytes(32).toString('hex')),
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

    return await bcrypt.compare(password, userDoc.passwordHash);
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
        user.email.toLowerCase().includes(term)
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
        `${doc.username} is an admin. Admins are set in the backend's ADMIN_EMAILS setting.`
      );
    }

    const updated = await this.db.update<UserDoc>(
      this.usersCollection,
      doc.id,
      {
        role,
      }
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
        !(await this.getUserByUsername(candidate))
      ) {
        return candidate;
      }
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
    const validatedEmail = await Joi.string().email().validateAsync(email);

    if (await this.getUserByEmail(validatedEmail)) {
      throw new AlreadyExistsError(
        'That email address is already registered. Sign in instead?'
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

  private validatePasswordOrThrow(password: string) {
    if (password.length < 8) {
      throw new RangeError('Your password needs at least 8 characters.');
    }
  }

  private async validateImageOrThrow(image: string) {
    await Joi.string().uri().validateAsync(image);
  }

  private async hashPassword(password: string) {
    return await bcrypt.hash(password, 8);
  }
}

export {ProviderSignIn, UsersService};
