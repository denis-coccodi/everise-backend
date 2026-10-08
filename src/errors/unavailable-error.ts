import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// Something this site isn't set up for (e.g. Discord sharing on staging).
class UnavailableError extends HttpError {
  readonly status = StatusCodes.SERVICE_UNAVAILABLE;
}

export {UnavailableError};
