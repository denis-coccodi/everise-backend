import {readFileSync} from 'fs';
import 'jest-extended';
import {join} from 'path';
import request from 'supertest';
import {config} from '../../src/config';
import {app, characters as model, usersClient} from '../utils';

// ADMIN_EMAILS is admin@example.com in the tests (utils/env.ts).
const ADMIN = {
  email: 'admin@example.com',
  username: 'Minfilia',
  password: 'echo-of-light',
};

async function adminToken() {
  const signedIn = await request(app)
    .post('/api/users/login')
    .send({user: {email: ADMIN.email, password: ADMIN.password}});
  if (signedIn.status === 200) return signedIn.body.user.token as string;
  const {user} = await usersClient.registerUser(
    ADMIN.email,
    ADMIN.username,
    ADMIN.password,
  );
  return user.token as string;
}

const as = (token: string) => ({
  get: (url: string) =>
    request(app).get(url).set('authorization', `Token ${token}`),
  put: (url: string) =>
    request(app).put(url).set('authorization', `Token ${token}`),
  delete: (url: string) =>
    request(app).delete(url).set('authorization', `Token ${token}`),
});

const png = readFileSync(join(__dirname, '../fixtures/images/small.png'));
const path = (url: string) => url.slice(config.baseUrl.length);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byId = (characters: any[], id: string) =>
  characters.find(c => c.id === id);

describe('editing the Waking Sands characters', () => {
  test('an admin sees every character with its personality and picture', async () => {
    const response = await as(await adminToken()).get('/api/admin/characters');

    expect(response.status).toBe(200);
    const characters = response.body.characters;
    const ids = characters.map((c: {id: string}) => c.id);
    expect(ids.slice(0, 3)).toEqual(['tataru', 'urianger', 'yshtola']);
    // Everise's own come last.
    expect(ids.slice(-2)).toEqual(['barnaby', 'bernadette']);
    expect(characters).toHaveLength(22);
    const [tataru] = characters;
    const barnaby = characters[20];
    expect(tataru).toMatchObject({
      name: 'Tataru Taru',
      image: `${config.baseUrl}/api/waking-sands/characters/tataru/picture`,
      bio: expect.stringContaining('roulette results'),
      edited: {title: false, persona: false, bio: false},
    });
    expect(tataru.persona).toContain('roulette results');
    expect(response.body.limits).toEqual({title: 80, persona: 4000, bio: 600});
    expect(tataru.persona).toBe(tataru.defaultPersona);
    expect(barnaby).toMatchObject({
      name: 'Barnaby Rostnsthalsyn',
      image: `${config.baseUrl}/api/waking-sands/characters/barnaby/picture`,
    });
  });

  test("an admin changes a character's title and personality, which the chat then uses", async () => {
    const admin = as(await adminToken());

    const saved = await admin.put('/api/admin/characters/urianger').send({
      character: {
        title: 'Keeper of riddles',
        persona: 'You are Urianger, and you only ever answer in riddles.',
      },
    });

    expect(saved.status).toBe(200);
    expect(saved.body.character).toMatchObject({
      title: 'Keeper of riddles',
      persona: 'You are Urianger, and you only ever answer in riddles.',
      edited: {title: true, persona: true},
    });
    const listed = await request(app).get('/api/waking-sands/room');
    expect(listed.body.characters[1].title).toBe('Keeper of riddles');

    model.asked = [];
    const member = (await usersClient.registerRandomUser()).user;
    await request(app)
      .post('/api/waking-sands/room/characters/urianger')
      .set('authorization', `Token ${member.token}`);
    await request(app)
      .post('/api/waking-sands/room/lines')
      .set('authorization', `Token ${member.token}`)
      .send({text: 'Hello'});
    expect(model.asked[0][0].content).toStartWith(
      'You are Urianger, and you only ever answer in riddles.',
    );
  });

  test('an empty title or personality goes back to the default', async () => {
    const admin = as(await adminToken());
    await admin
      .put('/api/admin/characters/yshtola')
      .send({character: {title: 'Changed', persona: 'Changed.'}});

    const reset = await admin
      .put('/api/admin/characters/yshtola')
      .send({character: {title: '', persona: ''}});

    expect(reset.body.character).toMatchObject({
      title: 'Sorceress of the Scions of the Seventh Dawn',
      edited: {title: false, persona: false},
    });
    expect(reset.body.character.persona).toBe(
      reset.body.character.defaultPersona,
    );
  });

  test('Bernadette is edited like the others: title, personality and picture', async () => {
    const admin = as(await adminToken());

    const saved = await admin.put('/api/admin/characters/bernadette').send({
      character: {
        title: 'Astrologian on holiday',
        persona: 'You are Bernie, and every card you draw is the Balance.',
      },
    });
    const pictured = await admin
      .put('/api/admin/characters/bernadette/image')
      .set('content-type', 'image/png')
      .send(png);

    expect(saved.status).toBe(200);
    expect(saved.body.character).toMatchObject({
      title: 'Astrologian on holiday',
      persona: 'You are Bernie, and every card you draw is the Balance.',
      edited: {title: true, persona: true},
    });
    expect(saved.body.character.defaultPersona).toContain('Astrologian');
    expect(pictured.status).toBe(200);
    expect(pictured.body.character.image).toContain('/api/profile-images/');
    const listed = await request(app).get('/api/waking-sands/room');
    expect(byId(listed.body.characters, 'bernadette')).toMatchObject({
      title: 'Astrologian on holiday',
      image: pictured.body.character.image,
    });

    // Back to her defaults, for the other tests.
    await admin
      .put('/api/admin/characters/bernadette')
      .send({character: {title: '', persona: ''}});
  });

  test("an admin changes a character's picture; the old upload is deleted", async () => {
    const admin = as(await adminToken());

    const first = await admin
      .put('/api/admin/characters/barnaby/image')
      .set('content-type', 'image/png')
      .send(png);
    expect(first.status).toBe(200);
    const firstImage = first.body.character.image as string;
    expect(firstImage).toContain('/api/profile-images/');
    expect((await request(app).get(path(firstImage))).status).toBe(200);

    const second = await admin
      .put('/api/admin/characters/barnaby/image')
      .set('content-type', 'image/png')
      .send(png);
    expect(second.body.character.image).not.toBe(firstImage);
    expect((await request(app).get(path(firstImage))).status).toBe(404);

    const listed = await request(app).get('/api/waking-sands/room');
    expect(byId(listed.body.characters, 'barnaby').image).toBe(
      second.body.character.image,
    );
  });

  test('an admin goes back to the default picture; the upload is deleted', async () => {
    const admin = as(await adminToken());
    const uploaded = await admin
      .put('/api/admin/characters/urianger/image')
      .set('content-type', 'image/png')
      .send(png);
    const upload = uploaded.body.character.image as string;
    expect(uploaded.body.character.edited.image).toBeTrue();

    const reset = await admin.delete('/api/admin/characters/urianger/image');

    expect(reset.status).toBe(200);
    expect(reset.body.character).toMatchObject({
      image: `${config.baseUrl}/api/waking-sands/characters/urianger/picture`,
      edited: {image: false},
    });
    expect((await request(app).get(path(upload))).status).toBe(404);
    const listed = await request(app).get('/api/waking-sands/room');
    expect(listed.body.characters[1].image).toBe(reset.body.character.image);
    // Already the default: nothing to do.
    expect(
      (await admin.delete('/api/admin/characters/urianger/image')).body
        .character.edited.image,
    ).toBeFalse();
  });

  test("Tataru's bio and picture are her profile's and her posts' author's, on guests' roulette results", async () => {
    const admin = as(await adminToken());
    await admin
      .put('/api/admin/characters/tataru')
      .send({character: {bio: 'Every gil accounted for.'}});
    const saved = await admin
      .put('/api/admin/characters/tataru/image')
      .set('content-type', 'image/png')
      .send(png);
    await request(app)
      .post('/api/duties/refresh')
      .set('X-Refresh-Key', process.env.DUTIES_REFRESH_KEY!)
      .send();

    const posted = await request(app)
      .post('/api/roulette-results')
      .set('cf-connecting-ip', '198.51.100.7')
      .send({
        result: {
          type: 'Dungeons',
          candidate: {kind: 'duty', id: 1},
          mode: 'Regular',
        },
      });

    expect(posted.status).toBe(201);
    expect(posted.body.article.author).toStrictEqual({
      id: 'character:tataru',
      username: 'Tataru Taru',
      characterName: null,
      server: null,
      displayName: 'Tataru Taru',
      following: false,
      bio: 'Every gil accounted for.',
      image: saved.body.character.image,
      character: 'tataru',
    });

    const profile = await request(app).get('/api/profiles/character:tataru');
    expect(profile.body.profile).toStrictEqual(posted.body.article.author);

    // Back to her defaults, for the other tests.
    const restored = await admin
      .put('/api/admin/characters/tataru')
      .send({character: {bio: ''}});
    expect(restored.body.character).toMatchObject({
      bio: expect.stringContaining('roulette results'),
      edited: {bio: false},
    });
  });

  test('every character has a profile anyone signed in or not can read, but nobody can change it there', async () => {
    for (const id of [
      'tataru',
      'urianger',
      'yshtola',
      'barnaby',
      'bernadette',
    ]) {
      const response = await request(app).get(`/api/profiles/character:${id}`);
      expect(response.status).toBe(200);
      expect(response.body.profile).toMatchObject({
        id: `character:${id}`,
        following: false,
        bio: expect.any(String),
        character: id,
      });
    }
    expect(
      (await request(app).get('/api/profiles/character:moogle')).status,
    ).toBe(404);

    // A member's settings change only their own account.
    const member = (await usersClient.registerRandomUser()).user;
    await request(app)
      .put('/api/user')
      .set('authorization', `Token ${member.token}`)
      .send({user: {bio: 'Mine now'}});
    const tataru = await request(app).get('/api/profiles/character:tataru');
    expect(tataru.body.profile.bio).toContain('roulette results');
  });

  test('a bio too long is refused with its message', async () => {
    const response = await as(await adminToken())
      .put('/api/admin/characters/urianger')
      .send({character: {bio: 'x'.repeat(601)}});

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      'Keep the bio to 600 characters.',
    ]);
  });

  test('only admins, and only known characters', async () => {
    const member = (await usersClient.registerRandomUser()).user;
    const asMember = as(member.token);
    expect((await asMember.get('/api/admin/characters')).status).toBe(403);
    expect(
      (
        await asMember
          .put('/api/admin/characters/tataru')
          .send({character: {title: 'Mine now'}})
      ).status,
    ).toBe(403);
    expect(
      (await asMember.delete('/api/admin/characters/tataru/image')).status,
    ).toBe(403);

    const admin = as(await adminToken());
    const unknown = await admin
      .put('/api/admin/characters/moogle')
      .send({character: {title: 'Rogue'}});
    expect(unknown.status).toBe(422);
    const unknownPicture = await admin
      .put('/api/admin/characters/moogle/image')
      .set('content-type', 'image/png')
      .send(png);
    expect(unknownPicture.status).toBe(404);
    expect(
      (await admin.delete('/api/admin/characters/moogle/image')).status,
    ).toBe(422);
  });
});
