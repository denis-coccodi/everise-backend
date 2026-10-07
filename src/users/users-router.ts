import {celebrate, Joi, Segments} from 'celebrate';
import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
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
  ALL_ERRORS,
  bio,
  email,
  image,
  newPassword,
  signInPassword,
  username,
} from './user-fields';
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

    router.post(
      '/users',
      celebrate(
        {
          [Segments.BODY]: Joi.object()
            .keys({
              user: Joi.object()
                .keys({
                  email: email().required(),
                  username: username().required(),
                  password: newPassword().required(),
                })
                .required(),
            })
            .required(),
        },
        ALL_ERRORS,
      ),
      async (req, res, next) => {
        try {
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
            return res
              .status(StatusCodes.CREATED)
              .json({confirmation: {email: user.email}});
          }

          return res.status(StatusCodes.CREATED).json(this.signIn(res, user));
        } catch (err) {
          return next(err);
        }
      },
    );

    router.post(
      '/users/login',
      celebrate(
        {
          [Segments.BODY]: Joi.object()
            .keys({
              user: Joi.object()
                .keys({
                  email: email().required(),
                  password: signInPassword().required(),
                })
                .required(),
            })
            .required(),
        },
        ALL_ERRORS,
      ),
      async (req, res, next) => {
        try {
          const {email, password} = req.body.user;

          try {
            const isValidPassword = await this.usersService.verifyPassword(
              email,
              password,
            );

            if (!isValidPassword) {
              throw new InvalidCredentialsError();
            }
          } catch (err) {
            if (err instanceof NotFoundError) {
              throw new InvalidCredentialsError();
            }
            throw err;
          }

          const user = (await this.usersService.getUserByEmail(email))!;
          if (!user.emailConfirmed) {
            throw new EmailNotConfirmedError(user.email);
          }

          return res.json(this.signIn(res, user));
        } catch (err) {
          return next(err);
        }
      },
    );

    // Opens a confirmation link: confirms the address and signs in.
    router.post(
      '/users/confirm-email',
      celebrate({
        [Segments.BODY]: Joi.object()
          .keys({token: Joi.string().max(200).required()})
          .required(),
      }),
      async (req, res, next) => {
        try {
          const user = await this.emailConfirmation.confirm(req.body.token);
          return res.json(this.signIn(res, user));
        } catch (err) {
          return next(err);
        }
      },
    );

    // Sends a sign-up's link again. Answers the same whether or not the
    // address has an account waiting, so it can't be used to find one out.
    router.post(
      '/users/confirm-email/resend',
      celebrate(
        {
          [Segments.BODY]: Joi.object()
            .keys({
              user: Joi.object().keys({email: email().required()}).required(),
            })
            .required(),
        },
        ALL_ERRORS,
      ),
      async (req, res, next) => {
        try {
          await this.emailConfirmation.resend(req.body.user.email);
          return res.status(StatusCodes.ACCEPTED).json({
            confirmation: {email: req.body.user.email},
          });
        } catch (err) {
          return next(err);
        }
      },
    );

    router.post('/users/logout', (_req, res) => {
      res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
      return res.status(StatusCodes.NO_CONTENT).send();
    });

    router.get('/user', this.auth.requireAuth, async (req, res) => {
      const user = req.user!;

      const token = this.jwtService.getToken(user);

      const userDto = new UserDto(user, token);

      return res.json(userDto);
    });

    router.put(
      '/user',
      celebrate(
        {
          [Segments.BODY]: Joi.object()
            .keys({
              user: Joi.object()
                .keys({
                  email: email(),
                  username: username(),
                  password: newPassword(),
                  bio: bio(),
                  image: image(),
                  darkMode: Joi.boolean(),
                })
                .required(),
            })
            .required(),
        },
        ALL_ERRORS,
      ),
      this.auth.requireAuth,
      async (req, res, next) => {
        try {
          const user = req.user!;

          const {user: updateUserData} = req.body;

          // A new email address is used once its link is opened.
          const updatedUser = await this.usersService.updateUser(
            user.id,
            updateUserData,
            {confirmNewEmail: this.emailConfirmation.enabled},
          );
          if (
            updatedUser.pendingEmail &&
            updatedUser.pendingEmail !== user.pendingEmail
          ) {
            await this.emailConfirmation.send(
              updatedUser,
              updatedUser.pendingEmail,
            );
          }

          const token = this.jwtService.getToken(updatedUser);

          const userDto = new UserDto(updatedUser, token);

          return res.json(userDto);
        } catch (err) {
          return next(err);
        }
      },
    );

    // Uploads a new profile picture (the file as the request body) and
    // replaces the old one.
    router.put(
      '/user/image',
      this.auth.requireAuth,
      readImageBody,
      async (req, res, next) => {
        try {
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

          return res.json(this.toDto(updated));
        } catch (err) {
          return next(err);
        }
      },
    );

    // Removes the profile picture, back to the default one.
    router.delete(
      '/user/image',
      this.auth.requireAuth,
      async (req, res, next) => {
        try {
          const user = req.user!;
          const updated = await this.usersService.setImage(user.id, undefined);
          await this.deleteUploadedImage(user);

          return res.json(this.toDto(updated));
        } catch (err) {
          return next(err);
        }
      },
    );

    router.get('/profile-images/:id', async (req, res, next) => {
      try {
        const image = await this.profileImagesService.get(req.params.id);
        if (!image) {
          throw new NotFoundError('profile image');
        }

        return (
          res
            .type(image.contentType)
            .set('Cache-Control', PROFILE_IMAGE_CACHE_CONTROL)
            // The type comes from the file's bytes; never let a browser guess
            // another, or run anything inside it.
            .set('X-Content-Type-Options', 'nosniff')
            .set('Content-Security-Policy', "default-src 'none'; sandbox")
            .send(Buffer.from(image.data))
        );
      } catch (err) {
        return next(err);
      }
    });

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
