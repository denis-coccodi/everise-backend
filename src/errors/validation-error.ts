import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// A request whose params, query or body don't match the route's schema; one
// message per field that failed (see src/api/messages.ts).
class ValidationError extends HttpError {
  readonly status = StatusCodes.UNPROCESSABLE_ENTITY;

  constructor(private readonly fieldMessages: string[]) {
    super(fieldMessages.join(' '));
  }

  override messages() {
    return this.fieldMessages;
  }
}

export {ValidationError};
