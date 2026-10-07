import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// An uploaded picture that can't be used; the message says why, for the user.
class InvalidImageError extends HttpError {
  constructor(
    message: string,
    // 413 for a file over the size limit, 422 otherwise.
    readonly status:
      | StatusCodes.REQUEST_TOO_LONG
      | StatusCodes.UNPROCESSABLE_ENTITY = StatusCodes.UNPROCESSABLE_ENTITY
  ) {
    super(message);
  }
}

export {InvalidImageError};
