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
    // A member's character in the game and its world, when they gave them.
    readonly characterName?: string,
    readonly server?: string,
  ) {}
}

export {Profile};
