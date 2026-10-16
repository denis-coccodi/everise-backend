import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {Auth} from '../middleware';
import {TurnstileVerifier} from '../turnstile';
import {PasswordReset} from './password-reset';
import {UserPasswords} from './user-passwords';
import {
  NewPasswordWithCode,
  PasswordResetRequest,
  PasswordResetResponse,
} from './user-schemas';
import {clearSessionCookie} from './users-router';

// "Forgot password?" on the sign-in page, and signing out (here or
// everywhere). A new password from the settings goes through PUT /user.
class PasswordRouter {
  constructor(
    private readonly auth: Auth,
    private readonly passwords: UserPasswords,
    private readonly passwordReset: PasswordReset,
    private readonly turnstile: TurnstileVerifier,
  ) {}

  get router() {
    const router = express.Router();

    // Answers the same whether or not the address has an account, so it
    // can't be used to find one out.
    route(
      router,
      {
        method: 'post',
        path: '/users/password-reset',
        summary: 'Email a code to choose a new password with',
        body: PasswordResetRequest,
        responses: {
          202: {
            description: 'Sent, if the address has an account.',
            schema: PasswordResetResponse,
          },
        },
      },
      async (req, res) => {
        await this.turnstile.verify(
          req.body.turnstileToken,
          'forgot-password',
          req.header('cf-connecting-ip'),
        );
        await this.passwordReset.send(req.body.user.email);
        res
          .status(StatusCodes.ACCEPTED)
          .json({passwordReset: {email: req.body.user.email}});
      },
    );

    // Doesn't sign in: the member signs in with the new password.
    route(
      router,
      {
        method: 'post',
        path: '/users/password-reset/confirm',
        summary: "Set a new password with the email's code",
        body: NewPasswordWithCode,
        responses: {
          204: {description: 'Changed; every device was signed out.'},
        },
      },
      async (req, res) => {
        await this.turnstile.verify(
          req.body.turnstileToken,
          'reset-password',
          req.header('cf-connecting-ip'),
        );
        await this.passwordReset.reset(req.body.code, req.body.password);
        clearSessionCookie(res);
        res.status(StatusCodes.NO_CONTENT).send();
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/users/logout',
        summary: 'Sign out (clears the session cookie)',
        responses: {204: {description: 'Signed out.'}},
      },
      (_req, res) => {
        clearSessionCookie(res);
        res.status(StatusCodes.NO_CONTENT).send();
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/users/logout-everywhere',
        summary: 'Sign out on every device',
        auth: this.auth.required,
        responses: {204: {description: 'Signed out everywhere.'}},
      },
      async (req, res) => {
        await this.passwords.signOutEverywhere(req.user!.id);
        clearSessionCookie(res);
        res.status(StatusCodes.NO_CONTENT).send();
      },
    );

    return router;
  }
}

export {PasswordRouter};
