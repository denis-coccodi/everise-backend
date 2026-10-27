import {Doc} from '../db';
import {ASSIGNABLE_ROLES} from './user';

// The settings; the password changes through UserPasswords.
interface UpdateUserParams {
  email?: string;
  username?: string;
  // Null clears them (both or neither).
  characterName?: string | null;
  server?: string | null;
  bio?: string | null;
  image?: string;
  darkMode?: boolean;
}

interface UserDoc extends Doc {
  email: string;
  username: string;
  // Their character in the game and its world, both or neither: what the
  // site calls them (see displayName).
  characterName?: string;
  server?: string;
  // Unset for someone who only ever signed in with a provider (Google,
  // Discord).
  passwordHash?: string;
  // The provider accounts that sign in to this one, by the provider's id for
  // the person.
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

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

// What a person may do: everyone registers as a user; an admin (set by the
// ADMIN_EMAILS secret) can make a user a staging tester, who may open the
// staging site, and edit the Waking Sands characters.
type Role = 'admin' | 'staging-tester' | 'user';

// The ways someone can sign in to an account: its password, and the
// provider accounts (Google, Discord) tied to it.
type SignInMethod = 'password' | 'google' | 'discord';

interface ImageInfo {
  type: ImageType;
  width: number;
  height: number;
}

type ImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

// What a sending document keeps of the last ones.
interface SendCount {
  lastSentAt: string;
  // Sent since dayStartedAt, against DAILY_SENDS.
  sendsToday: number;
  dayStartedAt: string;
}

export {
  AssignableRole,
  ImageInfo,
  ImageType,
  ProviderSignIn,
  Role,
  SendCount,
  SignInMethod,
  SignInProvider,
  UpdateUserParams,
  UserDoc,
};
