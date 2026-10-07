import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {route} from '../api';
import {config} from '../config';
import {
  EmailNotConfirmedError,
  InvalidCredentialsError,
  InvalidImageError,
  NotFoundError,
} from '../errors';
import {Auth} from '../middleware';
import {JWTService} from './jwt-service';
import {
  MAX_IMAGE_BYTES,
  ProfileImagesService,
  profileImageUrl,
  tooLarge,
  uploadedImageId,
} from './profile-images-service';
import {EmailConfirmation} from './email-confirmation';
import {User} from './user';
import {
  ConfirmationResponse,
  EmailConfirmationToken,
  LoginUser,
  NewUser,
  RegistrationResponse,
  ResendConfirmation,
  UserResponse,
  UserUpdate,
} from './user-schemas';
import {UsersService} from './users-service';

class UserDto {
  readonly user;

  constructor(user: User, token: string) {
    this.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      token,
      bio: user.bio || null,
      image: user.image || `${config.baseUrl}/assets/images/avatar-profile.png`,
      // Saved with the other settings; dark until the person turns it off.
      darkMode: user.darkMode ?? true,
      role: user.role,
      // How this account can be signed in to, e.g. ["password", "google"]:
      // the settings show the Google and Facebook accounts tied to it.
      signInMethods: user.signInMethods,
      // A new address from the settings, until its link is opened.
      pendingEmail: user.pendingEmail ?? null,
    };
  }
}

// An uploaded picture's id never gets new content, so it can be cached for good.
const PROFILE_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// The raw request body, whatever its content type (the picture's format is
// read from its bytes), up to the size limit.
const readImageBody: express.RequestHandler = (req, res, next) =>
  express.raw({type: () => true, limit: MAX_IMAGE_BYTES})(req, res, err =>
    next(err?.type === 'entity.too.large' ? tooLarge() : err),
  );

const COOKIE_NAME = 'token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  // SameSite=none requires Secure; Chrome allows Secure on http://localhost as a special exception.
  secure: true,
  // "none" while the FE runs on another site; "strict" once FE and API share an origin.
  sameSite: config.cookieSameSite,
};

// Signs the browser in: the session cookie, valid as long as the token.
function setSessionCookie(
  res: express.Response,
  token: string,
  secondsToExpiration: number,
) {
  res.cookie(COOKIE_NAME, token, {
    ...COOKIE_OPTIONS,
    maxAge: 1000 * secondsToExpiration,
  });
}

class UsersRouter {
  constructor(
    private readonly auth: Auth,
    private readonly usersService: UsersService,
    private readonly jwtService: JWTService,
    private readonly profileImagesService: ProfileImagesService,
    private readonly emailConfirmation: EmailConfirmation,
  ) {}

  // Signs the browser in as this user, and answers with them.
  private signIn(res: express.Response, user: User) {
    const token = this.jwtService.getToken(user);
    setSessionCookie(res, token, this.jwtService.secondsToExpiration);
    return new UserDto(user, token);
  }

  get router() {
    const router = express.Router();
    const signedIn = {200: {description: 'The user.', schema: UserResponse}};

    route(
      router,
      {
        method: 'post',
        path: '/users',
        summary: 'Sign up',
        body: NewUser,
        responses: {
          201: {
            description:
              'Signed in, or (when emails are confirmed) a link was sent.',
            schema: RegistrationResponse,
          },
        },
      },
      async (req, res) => {
        const {email, username, password} = req.body.user;
        const confirming = this.emailConfirmation.enabled;
        const user = await this.usersService.registerUser(
          email,
          username,
          password,
          !confirming,
        );

        // Signed in only once the link in the email is opened.
        if (confirming) {
          await this.emailConfirmation.send(user, user.email);
          res
            .status(StatusCodes.CREATED)
            .json({confirmation: {email: user.email}});
          return;
        }
        res.status(StatusCodes.CREATED).json(this.signIn(res, user));
      },
    );

    route(
      router,
      {
        method: 'post',
        path: '/users/login',
        summary: 'Sign in with email and password',
        body: LoginUser,
        responses: signedIn,
      },
      async (req, res) => {
        const {email, password} = req.body.user;
        try {
          if (!(await this.usersService.verifyPassword(email, password))) {
            throw new InvalidCredentialsError();
          }
        } catch (err) {
          if (err instanceof NotFoundError) throw new InvalidCredentialsError();
          throw err;
        }

        const user = (await this.usersService.getUserByEmail(email))!;
        if (!user.emailConfirmed) throw new EmailNotConfirmedError(user.email);
        res.json(this.signIn(res, user));
      },
    );

    // Opens a confirmation link: confirms the address and signs in.
    route(
      router,
      {
        method: 'post',
        path: '/users/confirm-email',
        summary: 'Open an email confirmation link (the token from it)',
        body: EmailConfirmationToken,
        responses: signedIn,
      },
      async (req, res) => {
        const user = await this.emailConfirmation.confirm(req.body.token);
        res.json(this.signIn(res, user));
      },
    );

    // Sends a sign-up's link again. Answers the same whether or not the
    // address has an account waiting, so it can't be used to find one out.
    route(
      router,
      {
        method: 'post',
        path: '/users/confirm-email/resend',
        summary: "Send a sign-up's confirmation link again",
        body: ResendConfirmation,
        responses: {
          202: {description: 'Sent, if needed.', schema: ConfirmationResponse},
        },
      },
      async (req, res) => {
        await this.emailConfirmation.resend(req.body.user.email);
        res
          .status(StatusCodes.ACCEPTED)
          .json({confirmation: {email: req.body.user.email}});
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
        res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
        res.status(StatusCodes.NO_CONTENT).send();
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/user',
        summary: 'The signed-in user',
        auth: this.auth.required,
        responses: signedIn,
      },
      (req, res) => {
        res.json(this.toDto(req.user!));
      },
    );

    route(
      router,
      {
        method: 'put',
        path: '/user',
        summary: 'Change the settings',
        auth: this.auth.required,
        body: UserUpdate,
        responses: signedIn,
      },
      async (req, res) => {
        const user = req.user!;
        // A new email address is used once its link is opened.
        const updated = await this.usersService.updateUser(
          user.id,
          req.body.user,
          {confirmNewEmail: this.emailConfirmation.enabled},
        );
        if (
          updated.pendingEmail &&
          updated.pendingEmail !== user.pendingEmail
        ) {
          await this.emailConfirmation.send(updated, updated.pendingEmail);
        }
        res.json(this.toDto(updated));
      },
    );

    // Uploads a new profile picture (the file as the request body) and
    // replaces the old one.
    route(
      router,
      {
        method: 'put',
        path: '/user/image',
        summary: 'Upload a profile picture (the file as the body)',
        auth: this.auth.required,
        bodyType: 'image',
        responses: signedIn,
      },
      readImageBody,
      async (req, res) => {
        const user = req.user!;
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          throw new InvalidImageError('Choose a picture to upload.');
        }
        const id = await this.profileImagesService.save(
          user.id,
          new Uint8Array(req.body),
        );
        const updated = await this.usersService.setImage(
          user.id,
          profileImageUrl(id),
        );
        await this.deleteUploadedImage(user);
        res.json(this.toDto(updated));
      },
    );

    // Removes the profile picture, back to the default one.
    route(
      router,
      {
        method: 'delete',
        path: '/user/image',
        summary: 'Remove the profile picture',
        auth: this.auth.required,
        responses: signedIn,
      },
      async (req, res) => {
        const user = req.user!;
        const updated = await this.usersService.setImage(user.id, undefined);
        await this.deleteUploadedImage(user);
        res.json(this.toDto(updated));
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/profile-images/:id',
        summary: 'An uploaded profile picture',
        tag: 'user',
        responses: {200: {description: 'The picture.', contentType: 'image/*'}},
      },
      async (req, res) => {
        const image = await this.profileImagesService.get(req.params.id);
        if (!image) throw new NotFoundError('profile image');
        res
          .type(image.contentType)
          .set('Cache-Control', PROFILE_IMAGE_CACHE_CONTROL)
          // The type comes from the file's bytes; never let a browser guess
          // another, or run anything inside it.
          .set('X-Content-Type-Options', 'nosniff')
          .set('Content-Security-Policy', "default-src 'none'; sandbox")
          .send(Buffer.from(image.data));
      },
    );

    return router;
  }

  private async deleteUploadedImage(user: User) {
    const id = uploadedImageId(user.image);
    if (id) {
      await this.profileImagesService.delete(user.id, id);
    }
  }

  private toDto(user: User) {
    return new UserDto(user, this.jwtService.getToken(user));
  }
}

export {UsersRouter, UserDto, readImageBody, setSessionCookie};
