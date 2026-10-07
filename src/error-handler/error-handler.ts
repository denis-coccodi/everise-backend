import * as util from 'util';
import {Response} from 'express';
import {isCelebrateError} from 'celebrate';
import {StatusCodes} from 'http-status-codes';
import {JsonWebTokenError} from 'jsonwebtoken';
import {HttpError} from '../errors';

// Every error answer has the same shape: {errors: {body: [messages]}}, plus
// any fields the error adds.
function errorsBody(messages: string[]) {
  return {errors: {body: messages}};
}

class ErrorHandler {
  public async handleError(error: Error, res: Response) {
    console.error(
      util.inspect(error, {showHidden: false, depth: null, colors: true}),
    );

    // The app's own errors carry their status (see HttpError).
    if (error instanceof HttpError) {
      return res
        .status(error.status)
        .set(error.headers())
        .json({...errorsBody([error.publicMessage]), ...error.extraBody()});
    }

    // Every message, also when a schema reports several (abortEarly: false).
    if (isCelebrateError(error)) {
      const errors = Array.from(error.details.values()).flatMap(value =>
        value.details.map(detail => detail.message),
      );
      return res
        .status(StatusCodes.UNPROCESSABLE_ENTITY)
        .json(errorsBody(errors));
    }

    // Thrown by validation helpers for a value out of its allowed range.
    if (error instanceof RangeError) {
      return res
        .status(StatusCodes.UNPROCESSABLE_ENTITY)
        .json(errorsBody([error.message]));
    }

    if (error instanceof JsonWebTokenError) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json(errorsBody(['unauthorized']));
    }

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json(errorsBody(['internal server error']));
  }
}

export const errorHandler = new ErrorHandler();
