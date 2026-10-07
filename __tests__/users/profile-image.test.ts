import 'jest-extended';
import {readFileSync} from 'fs';
import {join} from 'path';
import request from 'supertest';
import {config} from '../../src/config';
import {app} from '../utils/app';
import {usersClient} from '../utils';

const imageUrl = '/api/user/image';
const fixture = (name: string) =>
  readFileSync(join(__dirname, '../fixtures/images', name));

function upload(
  token: string,
  body: Buffer,
  type = 'application/octet-stream',
) {
  return request(app)
    .put(imageUrl)
    .set('authorization', `Token ${token}`)
    .set('content-type', type)
    .send(body);
}

// The path part of a stored picture's URL.
const pathOf = (url: string) => url.slice(config.baseUrl.length);

function getImage(path: string) {
  return request(app)
    .get(path)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
}

describe('profile pictures', () => {
  test('PUT /api/user/image should store the picture and make it the user image', async () => {
    const {user} = await usersClient.registerRandomUser();
    const png = fixture('small.png');

    const response = await upload(user.token, png, 'image/png');

    expect(response.status).toBe(200);
    expect(response.body.user.image).toStartWith(
      `${config.baseUrl}/api/profile-images/`,
    );

    const served = await getImage(pathOf(response.body.user.image));
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.body).toStrictEqual(png);

    const current = await request(app)
      .get('/api/user')
      .set('authorization', `Token ${user.token}`);
    expect(current.body.user.image).toBe(response.body.user.image);
  });

  test("should take the type from the file's bytes, not the request", async () => {
    const {user} = await usersClient.registerRandomUser();

    const response = await upload(
      user.token,
      fixture('small.jpg'),
      'image/png',
    );

    const served = await getImage(pathOf(response.body.user.image));
    expect(served.headers['content-type']).toBe('image/jpeg');
  });

  test('a new picture should replace and delete the old one', async () => {
    const {user} = await usersClient.registerRandomUser();
    const first = await upload(user.token, fixture('small.png'));

    const second = await upload(user.token, fixture('vp8.webp'));

    expect(second.body.user.image).not.toBe(first.body.user.image);
    expect((await getImage(pathOf(first.body.user.image))).status).toBe(404);
    expect((await getImage(pathOf(second.body.user.image))).status).toBe(200);
  });

  test('a picture of the largest allowed size should be accepted', async () => {
    const {user} = await usersClient.registerRandomUser();

    const response = await upload(user.token, fixture('max.png'));

    expect(response.status).toBe(200);
  });

  test.each([
    [
      'wider than 500 pixels',
      fixture('too-wide.png'),
      422,
      'The picture is 501 × 10 pixels; it can be at most 500 × 500.',
    ],
    [
      'over 300 KB',
      Buffer.concat([fixture('small.png'), Buffer.alloc(300 * 1024)]),
      413,
      'The picture is too large: it can be at most 300 KB.',
    ],
    [
      'not a picture',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      422,
      'Choose a PNG, JPEG, WebP or GIF picture.',
    ],
    ['empty', Buffer.alloc(0), 422, 'Choose a picture to upload.'],
  ])(
    'a picture %s should be rejected, keeping the old one',
    async (_label, body, status, message) => {
      const {user} = await usersClient.registerRandomUser();

      const response = await upload(user.token, body);

      expect(response.status).toBe(status);
      expect(response.body).toStrictEqual({errors: {body: [message]}});
      const current = await request(app)
        .get('/api/user')
        .set('authorization', `Token ${user.token}`);
      expect(current.body.user.image).toBe(user.image);
    },
  );

  test('PUT /api/user/image without signing in should return 401', async () => {
    const response = await request(app)
      .put(imageUrl)
      .set('content-type', 'image/png')
      .send(fixture('small.png'));

    expect(response.status).toBe(401);
  });

  test('DELETE /api/user/image should go back to the default picture and delete the upload', async () => {
    const {user} = await usersClient.registerRandomUser();
    const uploaded = await upload(user.token, fixture('small.png'));

    const response = await request(app)
      .delete(imageUrl)
      .set('authorization', `Token ${user.token}`);

    expect(response.status).toBe(200);
    expect(response.body.user.image).toBe(
      `${config.baseUrl}/assets/images/avatar-profile.png`,
    );
    expect((await getImage(pathOf(uploaded.body.user.image))).status).toBe(404);
  });

  test('GET /api/profile-images/:id should return 404 for an unknown picture', async () => {
    const response = await request(app).get('/api/profile-images/unknown');

    expect(response.status).toBe(404);
  });
});
