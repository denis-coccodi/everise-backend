import {Db} from '../db';
import {EmailSender} from '../email';
import {Auth} from '../middleware';
import {TurnstileFetch, TurnstileVerifier} from '../turnstile';
import {EmailConfirmation} from './email-confirmation';
import {JWTService} from './jwt-service';
import {PasswordReset} from './password-reset';
import {PasswordRouter} from './password-router';
import {ProfileImagesService} from './profile-images-service';
import {UserPasswords} from './user-passwords';
import {UsersRouter} from './users-router';
import {UsersService} from './users-service';

// What signing up and in by email needs, put together for the app
// (src/app.ts): the confirmation and password reset emails, and the bot
// check on the forms.
interface UsersParts {
  auth: Auth;
  db: Db;
  usersService: UsersService;
  jwtService: JWTService;
  profileImagesService: ProfileImagesService;
  emailSender: EmailSender | undefined;
  turnstile: {secretKey?: string; hostnames: string[]; fetch?: TurnstileFetch};
  baseUrl: string;
  now: () => Date;
}

function usersRoutes(parts: UsersParts) {
  const emailConfirmation = new EmailConfirmation(
    parts.db,
    parts.usersService,
    parts.emailSender,
    parts.baseUrl,
    parts.now,
  );
  const passwords = new UserPasswords(parts.db);
  const passwordReset = new PasswordReset(
    parts.db,
    parts.usersService,
    passwords,
    parts.emailSender,
    parts.baseUrl,
    parts.now,
  );
  const turnstile = new TurnstileVerifier(
    parts.turnstile.secretKey,
    parts.turnstile.hostnames,
    parts.turnstile.fetch,
  );
  return [
    new UsersRouter(
      parts.auth,
      parts.usersService,
      parts.jwtService,
      parts.profileImagesService,
      emailConfirmation,
      turnstile,
      passwords,
      passwordReset,
    ).router,
    new PasswordRouter(parts.auth, passwords, passwordReset, turnstile).router,
  ];
}

export {usersRoutes};
