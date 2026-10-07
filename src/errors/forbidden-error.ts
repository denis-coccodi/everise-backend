import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// Signed in, but not allowed to do this (e.g. an admin-only action).
class ForbiddenError extends HttpError {
  readonly status = StatusCodes.FORBIDDEN;
}

export {ForbiddenError};
