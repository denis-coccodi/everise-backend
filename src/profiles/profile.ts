class Profile {
  constructor(
    readonly id: string,
    readonly username: string,
    readonly following: boolean,
    readonly bio?: string,
    readonly image?: string,
    // A Waking Sands character's id, when the author is one (Tataru, on
    // guests' roulette results) rather than a member.
    readonly character?: string,
  ) {}
}

export {Profile};
