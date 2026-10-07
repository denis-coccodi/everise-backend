import {StatusCodes} from 'http-status-codes';
import {HttpError} from './http-error';

// A right password for an account whose email address hasn't been confirmed
// yet: it can't be signed in to until the link in the email is opened. Its
// own status and field, so the sign-in page can offer to send the link again.
class EmailNotConfirmedError extends HttpError {
  readonly status = StatusCodes.FORBIDDEN;

  constructor(readonly email: string) {
    super(
      `Confirm your email address first: open the link we sent to ${email}.`,
    );
  }

  override extraBody() {
    return {unconfirmedEmail: this.email};
  }
}

export {EmailNotConfirmedError};
