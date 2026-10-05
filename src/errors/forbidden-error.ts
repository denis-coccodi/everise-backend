// Signed in, but not allowed to do this (e.g. an admin-only action).
class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export {ForbiddenError};
