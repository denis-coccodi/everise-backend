// What a person may do: everyone registers as a user; an admin (set by the
// ADMIN_EMAILS secret) can make a user a staging tester, who may open the
// staging site, and edit the system accounts such as Tataru.
type Role = 'admin' | 'staging-tester' | 'user';

// The roles an admin can give; admin itself comes from the configuration.
const ASSIGNABLE_ROLES = ['user', 'staging-tester'] as const;
type AssignableRole = typeof ASSIGNABLE_ROLES[number];

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
    // An account the app posts as (Tataru), which nobody can sign in to.
    readonly system = false
  ) {}
}

export {ASSIGNABLE_ROLES, AssignableRole, Role, User};
