// An uploaded picture that can't be used; the message says why, for the user.
class InvalidImageError extends Error {
  constructor(
    message: string,
    // 413 for a file over the size limit, 422 otherwise.
    readonly status: 413 | 422 = 422
  ) {
    super(message);
  }
}

export {InvalidImageError};
