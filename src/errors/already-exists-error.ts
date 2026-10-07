import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

class AlreadyExistsError extends HttpError {
  readonly status = StatusCodes.UNPROCESSABLE_ENTITY;
}

export {AlreadyExistsError};
