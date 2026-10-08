import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// The bot check (Cloudflare Turnstile) was missing or didn't pass.
class BotCheckError extends HttpError {
  readonly status = StatusCodes.FORBIDDEN;
}

export {BotCheckError};
