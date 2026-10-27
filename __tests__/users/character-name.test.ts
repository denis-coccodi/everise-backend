import 'jest-extended';
import request from 'supertest';
import {faker} from '@faker-js/faker';
import {app} from '../utils/app';
import {usersClient} from '../utils';

const signUp = (user: Record<string, unknown>) =>
  request(app)
    .post('/api/users')
    .send({
      user: {
        email: faker.internet.email(),
        username: faker.internet.userName(),
        password: faker.internet.password(),
        ...user,
      },
    });
const settings = (token: string, user: Record<string, unknown>) =>
  request(app)
    .put('/api/user')
    .set('Authorization', `Token ${token}`)
    .send({user});

describe('a member’s character name and world', () => {
  test('are optional at sign-up, and name them once given: "Avar Kriss (Odin)"', async () => {
    const email = faker.internet.email();
    const response = await signUp({
      email,
      characterName: '  Avar   Kriss ',
      server: 'Odin',
    });
    expect(response.status).toBe(201);

    const {user} = await usersClient.confirmEmail(email);

    expect(user).toMatchObject({
      characterName: 'Avar Kriss',
      server: 'Odin',
      displayName: 'Avar Kriss (Odin)',
    });
    const profile = await request(app).get(`/api/profiles/${user.id}`);
    expect(profile.body.profile).toMatchObject({
      username: user.username,
      characterName: 'Avar Kriss',
      server: 'Odin',
      displayName: 'Avar Kriss (Odin)',
    });
  });

  test("leave the username as what the site calls a member who didn't give them", async () => {
    const {user} = await usersClient.registerRandomUser();

    expect(user).toMatchObject({
      characterName: null,
      server: null,
      displayName: user.username,
    });
  });

  test.each([
    [
      {characterName: 'Avar', server: 'Odin'},
      "Enter your character's first and last name as the game shows them, like Avar Kriss.",
    ],
    [
      {characterName: 'Avar Kriss2', server: 'Odin'},
      "Enter your character's first and last name as the game shows them, like Avar Kriss.",
    ],
    [
      {characterName: 'Averyveryverylong Kriss', server: 'Odin'},
      "Enter your character's first and last name as the game shows them, like Avar Kriss.",
    ],
    [
      {characterName: 'Avar Kriss', server: 'Atlantis'},
      "Choose your character's world from the list.",
    ],
    [
      {characterName: 'Avar Kriss'},
      "Enter both your character's name and their world, or leave both empty.",
    ],
    [
      {server: 'Odin'},
      "Enter both your character's name and their world, or leave both empty.",
    ],
  ])('refuse %j at sign-up', async (character, message) => {
    const response = await signUp(character);

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([message]);
  });

  test("take a name with an apostrophe or hyphen, as the game's do", async () => {
    const response = await signUp({
      characterName: "Y'shtola Rhul",
      server: 'Lich',
    });

    expect(response.status).toBe(201);
  });

  test('change in the settings, together, and clear together', async () => {
    const {user} = await usersClient.registerRandomUser();

    const set = await settings(user.token, {
      characterName: 'Avar Kriss',
      server: 'Odin',
    });
    expect(set.status).toBe(200);
    expect(set.body.user.displayName).toBe('Avar Kriss (Odin)');

    // The world alone, the name kept.
    const moved = await settings(user.token, {server: 'Phoenix'});
    expect(moved.body.user.displayName).toBe('Avar Kriss (Phoenix)');

    // One cleared alone leaves the other without it.
    const half = await settings(user.token, {characterName: null});
    expect(half.status).toBe(422);
    expect(half.body.errors.body).toEqual([
      "Enter both your character's name and their world, or leave both empty.",
    ]);

    const cleared = await settings(user.token, {
      characterName: '',
      server: null,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user).toMatchObject({
      characterName: null,
      server: null,
      displayName: user.username,
    });
  });
});
