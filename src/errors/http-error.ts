import {StatusCodes} from 'http-status-codes';

// The base of every error the API answers with on purpose: it carries its own
// HTTP status, so the error handler needs no list of classes. The message is
// shown to the user (in `errors.body`), unless `publicMessage` hides it.
abstract class HttpError extends Error {
  abstract readonly status: StatusCodes;

  // What the response says; the full message still goes to the log.
  get publicMessage(): string {
    return this.message;
  }

  // The response's messages: one, unless an error reports several fields.
  messages(): string[] {
    return [this.publicMessage];
  }

  // Extra response headers (e.g. Retry-After).
  headers(): Record<string, string> {
    return {};
  }

  // Extra fields next to `errors` in the response body.
  extraBody(): Record<string, unknown> {
    return {};
  }
}

export {HttpError};
