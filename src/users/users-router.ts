import {celebrate, Joi, Segments} from 'celebrate';
import * as express from 'express';
import {StatusCodes} from 'http-status-codes';
import {config} from '../config';
import {
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
    };
  }
}

// An uploaded picture's id never gets new content, so it can be cached for good.
const PROFILE_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// The raw request body, whatever its content type (the picture's format is
// read from its bytes), up to the size limit.
const readImageBody: express.RequestHandler = (req, res, next) =>
  express.raw({type: () => true, limit: MAX_IMAGE_BYTES})(req, res, err =>
    next(err?.type === 'entity.too.large' ? tooLarge() : err)
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
  secondsToExpiration: number
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
    private readonly profileImagesService: ProfileImagesService
  ) {}

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
        ALL_ERRORS
      ),
      async (req, res, next) => {
        try {
          const {email, username, password} = req.body.user;

          const user = await this.usersService.registerUser(
            email,
            username,
            password
          );

          const token = this.jwtService.getToken(user);

          const userDto = new UserDto(user, token);

          setSessionCookie(res, token, this.jwtService.secondsToExpiration);

          return res.status(StatusCodes.CREATED).json(userDto);
        } catch (err) {
          return next(err);
        }
      }
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
        ALL_ERRORS
      ),
      async (req, res, next) => {
        try {
          const {email, password} = req.body.user;

          try {
            const isValidPassword = await this.usersService.verifyPassword(
              email,
              password
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

          const token = this.jwtService.getToken(user);

          const userDto = new UserDto(user, token);

          setSessionCookie(res, token, this.jwtService.secondsToExpiration);

          return res.json(userDto);
        } catch (err) {
          return next(err);
        }
      }
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
        ALL_ERRORS
      ),
      this.auth.requireAuth,
      async (req, res, next) => {
        try {
          const user = req.user!;

          const {user: updateUserData} = req.body;

          const updatedUser = await this.usersService.updateUser(
            user.id,
            updateUserData
          );

          const token = this.jwtService.getToken(updatedUser);

          const userDto = new UserDto(updatedUser, token);

          return res.json(userDto);
        } catch (err) {
          return next(err);
        }
      }
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
            new Uint8Array(req.body)
          );
          const updated = await this.usersService.setImage(
            user.id,
            profileImageUrl(id)
          );
          await this.deleteUploadedImage(user);

          return res.json(this.toDto(updated));
        } catch (err) {
          return next(err);
        }
      }
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
      }
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
