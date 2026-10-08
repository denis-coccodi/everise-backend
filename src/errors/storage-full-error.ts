import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// The site's storage for uploads is full, whoever uploads.
class StorageFullError extends HttpError {
  readonly status = StatusCodes.INSUFFICIENT_STORAGE;
}

export {StorageFullError};
