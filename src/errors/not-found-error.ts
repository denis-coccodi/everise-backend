import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

class NotFoundError extends HttpError {
  readonly status = StatusCodes.NOT_FOUND;
}

export {NotFoundError};
