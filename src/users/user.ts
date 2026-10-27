import {Role, SignInMethod} from './user-model';

// The roles an admin can give; admin itself comes from the configuration.
const ASSIGNABLE_ROLES = ['user', 'staging-tester'] as const;

class User {
  constructor(
    readonly id: string,
    readonly email: string,
    readonly username: string,
    readonly bio?: string,
    readonly image?: string,
    // The site's colour mode; unset means the default, dark.
    readonly darkMode?: boolean,
    readonly role: Role = 'user',
    readonly signInMethods: SignInMethod[] = ['password'],
    // False for an account signed up with a password whose email hasn't
    // been confirmed yet: it can't be signed in to.
    readonly emailConfirmed = true,
    // A new address from the settings, waiting for its link to be opened.
    readonly pendingEmail?: string,
    // Goes up when the password changes or the member signs out everywhere:
    // tokens made before then no longer sign in.
    readonly sessionVersion = 0,
    // Their character in the game and its world, when they gave them.
    readonly characterName?: string,
    readonly server?: string,
  ) {}
}

export {ASSIGNABLE_ROLES, User};
