import {config} from '../config';
import {Doc} from '../db';
import {currentSiteUrl} from '../site-urls';
import {AssignableRole, Role, SignInMethod, User} from './user';

// A user as the database stores them, and how it becomes a User.

// The settings; the password changes through UserPasswords.
interface UpdateUserParams {
  email?: string;
  username?: string;
  bio?: string | null;
  image?: string;
  darkMode?: boolean;
}

interface UserDoc extends Doc {
  email: string;
  username: string;
  // Unset for someone who only ever signed in with a provider (Google,
  // Discord).
  passwordHash?: string;
  // The provider accounts that sign in to this one, by the provider's id for
  // the person. Accounts from before October 2026 may also hold facebookId
  // or microsoftId, from providers since dropped; nothing reads them.
  googleId?: string;
  discordId?: string;
  bio?: string;
  image?: string;
  darkMode?: boolean;
  // false until a password sign-up opens its confirmation link; missing on
  // accounts from before email confirmation, which count as confirmed.
  emailConfirmed?: boolean;
  // A new address from the settings, used once its link is opened.
  pendingEmail?: string;
  // Given by an admin; admins themselves come from ADMIN_EMAILS.
  role?: AssignableRole;
  // In every token; raised to sign out everywhere (missing counts as 0).
  sessionVersion?: number;
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
  discord: 'discordId',
} as const;
const PROVIDER_NAMES = {
  google: 'Google',
  discord: 'Discord',
} as const;

// Usernames nobody can take, compared without case: the name Tataru, who
// posts guests' roulette results, is the Waking Sands character's.
const RESERVED_USERNAMES = ['tataru'];

function isAdminEmail(email: string) {
  return config.adminEmails.includes(email.toLowerCase());
}

function roleOf(doc: UserDoc): Role {
  return isAdminEmail(doc.email) ? 'admin' : (doc.role ?? 'user');
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
    currentSiteUrl(doc.image),
    doc.darkMode,
    roleOf(doc),
    signInMethodsOf(doc),
    doc.emailConfirmed !== false,
    doc.pendingEmail,
    doc.sessionVersion ?? 0,
  );
}

export {
  UpdateUserParams,
  UserDoc,
  ProviderSignIn,
  SignInProvider,
  PROVIDER_FIELDS,
  PROVIDER_NAMES,
  RESERVED_USERNAMES,
  isAdminEmail,
  roleOf,
  signInMethodsOf,
  toUser,
};
