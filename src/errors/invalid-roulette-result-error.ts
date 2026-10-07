import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// A posted roulette result the roulette couldn't have produced.
class InvalidRouletteResultError extends HttpError {
  readonly status = StatusCodes.UNPROCESSABLE_ENTITY;
}

export {InvalidRouletteResultError};
