import 'jest-extended';
import {readFileSync} from 'fs';
import {join} from 'path';
import request from 'supertest';
import {URL} from 'url';
import {config} from '../../src/config';
import {app, clock, giphy, usersClient} from '../utils';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../fixtures/images', name));

// A PNG of any size: a real header, then filler. Only the header is read.
function pngOf(bytes: number) {
  const png = Buffer.alloc(bytes);
  fixture('max.png').copy(png, 0, 0, 64);
  return png;
}

const upload = (token: string | undefined, body: Buffer) => {
  const req = request(app).post('/api/media').send(body);
  return token ? req.set('authorization', `Token ${token}`) : req;
};

async function signedIn() {
  return (await usersClient.registerRandomUser()).user.token as string;
}

describe('uploading images and GIFs', () => {
  afterEach(() => {
    clock.now = undefined;
  });

  test('stores an upload and serves it back, byte for byte', async () => {
    const gif = fixture('pixel.gif');

    const response = await upload(await signedIn(), gif);

    expect(response.status).toBe(201);
    const {media} = response.body;
    expect(media).toStrictEqual({
      id: expect.any(String),
      url: `${config.baseUrl}/api/media/${media.id}`,
      contentType: 'image/gif',
      width: 1,
      height: 1,
    });
    const served = await request(app).get(new URL(media.url).pathname);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/gif');
    expect(served.headers['cache-control']).toContain('immutable');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(served.body, gif)).toBe(0);
  });

  test('a 1 MB image is stored and comes back whole', async () => {
    const big = pngOf(1024 * 1024);
    big[5000] = 7;
    big[big.length - 1] = 9;

    const {body} = await upload(await signedIn(), big);
    const served = await request(app)
      .get(`/api/media/${body.media.id}`)
      .buffer(true)
      .parse((res, done) => {
        const parts: Buffer[] = [];
        res.on('data', (part: Buffer) => parts.push(part));
        res.on('end', () => done(null, Buffer.concat(parts)));
      });

    expect(Buffer.compare(served.body, big)).toBe(0);
  });

  test('refuses what is too large, not an image, or from a guest', async () => {
    const token = await signedIn();

    const large = await upload(token, pngOf(1024 * 1024 + 1));
    expect(large.status).toBe(413);
    expect(large.body.errors.body[0]).toBe(
      'The image is too large: it can be at most 1 MB.'
    );

    const text = await upload(token, Buffer.from('not an image at all'));
    expect(text.status).toBe(422);

    expect((await upload(undefined, fixture('pixel.gif'))).status).toBe(401);
    expect((await request(app).get('/api/media/nothing')).status).toBe(404);
  });

  test('allows 30 uploads a day per person', async () => {
    const token = await signedIn();
    clock.now = new Date('2026-10-06T10:00:00Z');
    for (let i = 0; i < 30; i++) {
      expect((await upload(token, fixture('pixel.gif'))).status).toBe(201);
    }

    const refused = await upload(token, fixture('pixel.gif'));
    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBe(String(24 * 60 * 60));

    clock.now = new Date('2026-10-07T10:00:01Z');
    expect((await upload(token, fixture('pixel.gif'))).status).toBe(201);
  });
});

describe('GIF search', () => {
  const giphyGif = (id: string) => ({
    id,
    title: `Moogle ${id}`,
    images: {
      fixed_height_small: {url: `https://media.giphy.com/${id}/small.gif`},
      downsized_medium: {
        url: `https://media.giphy.com/${id}/medium.gif`,
        width: '480',
        height: '270',
      },
    },
  });

  beforeEach(() => {
    giphy.status = 200;
    giphy.calls = [];
  });

  test('is offered when GIPHY is set up', async () => {
    const response = await request(app).get('/api/gifs/available');

    expect(response.body).toStrictEqual({available: true});
  });

  test('searches GIPHY with the secret key and gives back what the picker needs', async () => {
    giphy.body = {
      data: [giphyGif('a'), giphyGif('b')],
      pagination: {total_count: 50, count: 2, offset: 24},
    };

    const response = await request(app)
      .get('/api/gifs')
      .query({q: ' moogle ', offset: 24})
      .set('authorization', `Token ${await signedIn()}`);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      gifs: [
        {
          id: 'a',
          title: 'Moogle a',
          previewUrl: 'https://media.giphy.com/a/small.gif',
          url: 'https://media.giphy.com/a/medium.gif',
          width: 480,
          height: 270,
        },
        expect.objectContaining({id: 'b'}),
      ],
      next: 26,
    });
    const asked = new URL(giphy.calls[0]);
    expect(asked.pathname).toBe('/v1/gifs/search');
    expect(asked.searchParams.get('q')).toBe('moogle');
    expect(asked.searchParams.get('api_key')).toBe('giphy-key');
    expect(asked.searchParams.get('rating')).toBe('pg-13');
    expect(asked.searchParams.get('offset')).toBe('24');
  });

  test('shows trending GIFs without words, with no next page at the end', async () => {
    giphy.body = {
      data: [giphyGif('c')],
      pagination: {total_count: 1, offset: 0},
    };

    const response = await request(app)
      .get('/api/gifs')
      .set('authorization', `Token ${await signedIn()}`);

    expect(new URL(giphy.calls[0]).pathname).toBe('/v1/gifs/trending');
    expect(response.body.next).toBeNull();
  });

  test('is for signed-in members, and says when GIPHY fails', async () => {
    expect((await request(app).get('/api/gifs')).status).toBe(401);

    giphy.status = 429;
    const response = await request(app)
      .get('/api/gifs')
      .query({q: 'cat'})
      .set('authorization', `Token ${await signedIn()}`);

    expect(response.status).toBe(502);
    expect(response.body.errors.body[0]).toBe(
      "GIF search isn't available right now (GIPHY answered 429)."
    );
  });
});
