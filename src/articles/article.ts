// A roulette result shown as a card, like the roulette's "Duty Found"
// window. Built by the backend from its own duty data, never from the client.
interface RouletteCard {
  type: string;
  name: string;
  // Level, item level and expansion, or what a duty roulette covers.
  detail: string;
  // The party settings, e.g. "Everyone on the same job: Ninja".
  mode: string;
  // True for a duty roulette: the game picks the duty.
  dutyUnknown: boolean;
  // The duty's or roulette's banner, an id for GET /api/images/:id.
  image: number | null;
  // The job dealt by "dealer's choice".
  job: {name: string; icon: number} | null;
  // Posted by Tataru for someone who wasn't signed in.
  guest: boolean;
}

class Article {
  constructor(
    readonly id: string,
    readonly authorId: string,
    // Only on posts from before posts had ids in their links.
    readonly slug: string | undefined,
    readonly title: string,
    readonly description: string,
    readonly body: string,
    readonly tags: string[],
    readonly favoritedBy: string[],
    readonly createdAt: Date,
    readonly updatedAt: Date,
    readonly roulette?: RouletteCard
  ) {}
}

export {Article, RouletteCard};
