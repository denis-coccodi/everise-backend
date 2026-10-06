class Profile {
  constructor(
    readonly id: string,
    readonly username: string,
    readonly following: boolean,
    readonly bio?: string,
    readonly image?: string
  ) {}
}

export {Profile};
