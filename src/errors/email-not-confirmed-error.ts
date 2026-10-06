// A right password for an account whose email address hasn't been confirmed
// yet: it can't be signed in to until the link in the email is opened.
class EmailNotConfirmedError extends Error {
  constructor(readonly email: string) {
    super(
      `Confirm your email address first: open the link we sent to ${email}.`
    );
  }
}

export {EmailNotConfirmedError};
