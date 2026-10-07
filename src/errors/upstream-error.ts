import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// An external service this app depends on failed or answered unexpectedly.
class UpstreamError extends HttpError {
  readonly status = StatusCodes.BAD_GATEWAY;
}

export {UpstreamError};
