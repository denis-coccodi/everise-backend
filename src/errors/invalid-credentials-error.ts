// A sign-in with an unknown email or a wrong password. The response doesn't
// say which, so it can't be used to find out who has an account.
class InvalidCredentialsError extends Error {
  constructor() {
    super('Wrong email or password.');
  }
}

export {InvalidCredentialsError};
