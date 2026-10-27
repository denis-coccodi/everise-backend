import {config} from '../config';
import {currentSiteUrl} from '../site-urls';
import {User} from './user';
import {UserDoc, SignInProvider} from './user-model';
import {Role, SignInMethod} from './user-model';

// A user as the database stores them, and how it becomes a User.

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
    doc.characterName,
    doc.server,
  );
}

export {
  PROVIDER_FIELDS,
  PROVIDER_NAMES,
  RESERVED_USERNAMES,
  isAdminEmail,
  roleOf,
  signInMethodsOf,
  toUser,
};
