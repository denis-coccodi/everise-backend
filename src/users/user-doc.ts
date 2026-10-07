import {config} from '../config';
import {Doc} from '../db';
import {currentSiteUrl} from '../site-urls';
import {AssignableRole, Role, SignInMethod, User} from './user';

// A user as the database stores them, and how it becomes a User.

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
  // false until a password sign-up opens its confirmation link; missing on
  // accounts from before email confirmation, which count as confirmed.
  emailConfirmed?: boolean;
  // A new address from the settings, used once its link is opened.
  pendingEmail?: string;
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
    !!doc.system,
    signInMethodsOf(doc),
    doc.emailConfirmed !== false,
    doc.pendingEmail,
  );
}

export {
  UpdateUserParams,
  UserDoc,
  SystemUserParams,
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
