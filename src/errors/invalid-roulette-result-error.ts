// A posted roulette result the roulette couldn't have produced.
class InvalidRouletteResultError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export {InvalidRouletteResultError};
