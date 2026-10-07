import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// Not signed in, or a bad token. The response says only "unauthorized"; the
// message, which says why, is for the log.
class UnauthorizedError extends HttpError {
  readonly status = StatusCodes.UNAUTHORIZED;

  override get publicMessage() {
    return 'unauthorized';
  }
}

export {UnauthorizedError};
