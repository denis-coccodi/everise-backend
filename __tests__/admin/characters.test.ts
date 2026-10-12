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
});

const png = readFileSync(join(__dirname, '../fixtures/images/small.png'));
const path = (url: string) => url.slice(config.baseUrl.length);

describe('editing the Waking Sands characters', () => {
  test('an admin sees every character with its personality and picture', async () => {
    const response = await as(await adminToken()).get('/api/admin/characters');

    expect(response.status).toBe(200);
    const characters = response.body.characters;
    expect(characters.map((c: {id: string}) => c.id)).toEqual([
      'tataru',
      'urianger',
      'yshtola',
      'barnaby',
      'bernadette',
    ]);
    const [tataru, , , barnaby] = characters;
    expect(tataru).toMatchObject({
      name: 'Tataru Taru',
      image: `${config.baseUrl}/api/waking-sands/characters/tataru/picture`,
      edited: {title: false, persona: false},
    });
    expect(tataru.persona).toContain('roulette results');
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
    expect(listed.body.characters[4]).toMatchObject({
      id: 'bernadette',
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
    expect(listed.body.characters[3].image).toBe(second.body.character.image);
  });

  test("Tataru's title and picture are her posts' author's, on guests' roulette results", async () => {
    const admin = as(await adminToken());
    await admin
      .put('/api/admin/characters/tataru')
      .send({character: {title: 'Keeper of the ledger'}});
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
      following: false,
      bio: 'Keeper of the ledger',
      image: saved.body.character.image,
      character: 'tataru',
    });

    // Back to her defaults, for the other tests.
    await admin
      .put('/api/admin/characters/tataru')
      .send({character: {title: ''}});
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

    const admin = as(await adminToken());
    const unknown = await admin
      .put('/api/admin/characters/thancred')
      .send({character: {title: 'Rogue'}});
    expect(unknown.status).toBe(422);
    const unknownPicture = await admin
      .put('/api/admin/characters/thancred/image')
      .set('content-type', 'image/png')
      .send(png);
    expect(unknownPicture.status).toBe(404);
  });
});
