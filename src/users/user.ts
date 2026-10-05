class User {
  constructor(
    readonly id: string,
    readonly email: string,
    readonly username: string,
    readonly bio?: string,
    readonly image?: string,
    // The site's colour mode; unset means the default, dark.
    readonly darkMode?: boolean
  ) {}
}

export {User};
