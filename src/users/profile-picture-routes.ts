import * as express from 'express';
import {route} from '../api';
import {InvalidImageError, NotFoundError} from '../errors';
import {Auth} from '../middleware';
import {
  MAX_IMAGE_BYTES,
  ProfileImagesService,
  profileImageUrl,
  tooLarge,
  uploadedImageId,
} from './profile-images-service';
import {User} from './user';
import {UserResponse} from './user-schemas';
import {UsersService} from './users-service';

// An uploaded picture's id never gets new content, so it can be cached for good.
const PROFILE_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// The raw request body, whatever its content type (the picture's format is
// read from its bytes), up to the size limit.
const readImageBody: express.RequestHandler = (req, res, next) =>
  express.raw({type: () => true, limit: MAX_IMAGE_BYTES})(req, res, err =>
    next(err?.type === 'entity.too.large' ? tooLarge() : err),
  );

interface Deps {
  auth: Auth;
  usersService: UsersService;
  profileImagesService: ProfileImagesService;
  // The user as GET /api/user answers with them.
  toDto: (user: User) => unknown;
}

// The signed-in user's profile picture (upload, removal) and serving
// uploaded pictures, added to the users router.
function addProfilePictureRoutes(
  router: express.Router,
  {auth, usersService, profileImagesService, toDto}: Deps,
) {
  const signedIn = {200: {description: 'The user.', schema: UserResponse}};

  // The picture the user had uploaded, now replaced or removed.
  const deleteUploadedImage = async (user: User) => {
    const id = uploadedImageId(user.image);
    if (id) await profileImagesService.delete(user.id, id);
  };

  // Uploads a new profile picture (the file as the request body) and
  // replaces the old one.
  route(
    router,
    {
      method: 'put',
      path: '/user/image',
      summary: 'Upload a profile picture (the file as the body)',
      auth: auth.required,
      bodyType: 'image',
      responses: signedIn,
    },
    readImageBody,
    async (req, res) => {
      const user = req.user!;
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new InvalidImageError('Choose a picture to upload.');
      }
      const id = await profileImagesService.save(
        user.id,
        new Uint8Array(req.body),
      );
      const updated = await usersService.setImage(user.id, profileImageUrl(id));
      await deleteUploadedImage(user);
      res.json(toDto(updated));
    },
  );

  // Removes the profile picture, back to the default one.
  route(
    router,
    {
      method: 'delete',
      path: '/user/image',
      summary: 'Remove the profile picture',
      auth: auth.required,
      responses: signedIn,
    },
    async (req, res) => {
      const user = req.user!;
      const updated = await usersService.setImage(user.id, undefined);
      await deleteUploadedImage(user);
      res.json(toDto(updated));
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
      const image = await profileImagesService.get(req.params.id);
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
}

export {addProfilePictureRoutes, readImageBody};
