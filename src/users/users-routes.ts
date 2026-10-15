import {Db} from '../db';
import {EmailSender} from '../email';
import {Auth} from '../middleware';
import {TurnstileFetch, TurnstileVerifier} from '../turnstile';
import {EmailConfirmation} from './email-confirmation';
import {JWTService} from './jwt-service';
import {ProfileImagesService} from './profile-images-service';
import {UsersRouter} from './users-router';
import {UsersService} from './users-service';

// What signing up and in by email needs, put together for the app
// (src/app.ts): the confirmation emails, and the bot check on the forms.
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
  return new UsersRouter(
    parts.auth,
    parts.usersService,
    parts.jwtService,
    parts.profileImagesService,
    emailConfirmation,
    new TurnstileVerifier(
      parts.turnstile.secretKey,
      parts.turnstile.hostnames,
      parts.turnstile.fetch,
    ),
  ).router;
}

export {usersRoutes};
