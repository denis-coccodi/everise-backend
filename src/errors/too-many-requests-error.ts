// Too many posts too quickly; the message says when to try again.
class TooManyRequestsError extends Error {
  constructor(message: string, readonly retryAfterSeconds: number) {
    super(message);
  }
}

export {TooManyRequestsError};
