import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// A role change that can't be made (e.g. demoting an admin).
class InvalidRoleError extends HttpError {
  readonly status = StatusCodes.UNPROCESSABLE_ENTITY;
}

export {InvalidRoleError};
