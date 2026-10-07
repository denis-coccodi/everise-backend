import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// Too many posts too quickly; the message says when to try again.
class TooManyRequestsError extends HttpError {
  readonly status = StatusCodes.TOO_MANY_REQUESTS;

  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }

  override headers() {
    return {'Retry-After': String(this.retryAfterSeconds)};
  }
}

export {TooManyRequestsError};
