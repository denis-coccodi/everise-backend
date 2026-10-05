import 'jest-extended';
import request from 'supertest';
import {faker} from '@faker-js/faker';
import {app} from '../utils/app';
import {usersClient} from '../utils';
import {config} from '../../src/config';

describe('POST /api/users', () => {
  const registerUserUrl = '/api/users';

  test('given every field empty should list a message for each', async () => {
    const response = await request(app)
      .post(registerUserUrl)
      .send({user: {email: '', username: '', password: ''}});

    expect(response.status).toBe(422);
    expect(response.body).toStrictEqual({
      errors: {
        body: [
          'Enter your email address.',
          'Choose a username.',
          'Choose a password.',
        ],
      },
    });
  });

  describe('given a valid request', () => {
    test('should return http status code 201 and the created user', async () => {
      const requestBody = {
        user: {
          email: faker.internet.email(),
          username: faker.internet.userName(),
          password: faker.internet.password(),
        },
      };

      const response = await request(app)
        .post(registerUserUrl)
        .send(requestBody);

      expect(response.status).toBe(201);
      expect(response.body).toStrictEqual({
        user: {
          email: requestBody.user.email,
          username: requestBody.user.username,
          token: expect.not.toBeEmpty(),
          bio: null,
          image: `${config.baseUrl}/assets/images/avatar-profile.png`,
        },
      });
    });
  });

  describe('email validation', () => {
    test('given no email should return http status code 422 and an errors object', async () => {
      const requestBody = {
        user: {
          username: faker.internet.userName(),
          password: faker.internet.password(),
        },
      };

      const response = await request(app)
        .post(registerUserUrl)
        .send(requestBody);

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['Enter your email address.'],
        },
      });
    });

    test('given an invalid email should return http status code 422 and an errors object', async () => {
      const requestBody = {
        user: {
          email: 'invalid',
          username: faker.internet.userName(),
          password: faker.internet.password(),
        },
      };

      const response = await request(app)
        .post(registerUserUrl)
        .send(requestBody);

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['Enter a valid email address, like name@example.com.'],
        },
      });
    });

    test('given email is taken should return http status code 422 and an errors object', async () => {
      const existingUser = await usersClient.registerRandomUser();

      const requestBody = {
        user: {
          email: existingUser.user.email,
          username: faker.internet.userName(),
          password: faker.internet.password(),
        },
      };

      const response = await request(app)
        .post(registerUserUrl)
        .send(requestBody);

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['That email address is already registered. Sign in instead?'],
        },
      });
    });
  });

  describe('username validation', () => {
    test('given no username should return http status code 422 and an errors object', async () => {
      const requestBody = {
        user: {
          email: faker.internet.email(),
          password: faker.internet.password(),
        },
      };

      const response = await request(app)
        .post(registerUserUrl)
        .send(requestBody);

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['Choose a username.'],
        },
      });
    });

    test('given username is taken should return http status code 422 and an errors object', async () => {
      const existingUser = await usersClient.registerRandomUser();

      const requestBody = {
        user: {
          email: faker.internet.email(),
          username: existingUser.user.username,
          password: faker.internet.password(),
        },
      };

      const response = await request(app)
        .post(registerUserUrl)
        .send(requestBody);

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['That username is taken. Try another one.'],
        },
      });
    });
  });

  describe('password validation', () => {
    test('given no password should return http status code 422 and an errors object', async () => {
      const requestBody = {
        user: {
          email: faker.internet.email(),
          username: faker.internet.userName(),
        },
      };

      const response = await request(app)
        .post(registerUserUrl)
        .send(requestBody);

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['Choose a password.'],
        },
      });
    });

    test('given password is less than 8 characters should return http status code 422 and an errors object', async () => {
      const requestBody = {
        user: {
          email: faker.internet.email(),
          username: faker.internet.userName(),
          password: faker.lorem.word(7),
        },
      };

      const response = await request(app)
        .post(registerUserUrl)
        .send(requestBody);

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['Your password needs at least 8 characters.'],
        },
      });
    });
  });
});
