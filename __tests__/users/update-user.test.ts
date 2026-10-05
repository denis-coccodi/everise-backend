import 'jest-extended';
import request from 'supertest';
import {faker} from '@faker-js/faker';
import {app} from '../utils/app';
import {usersClient, jwt} from '../utils';

describe('PUT /api/user', () => {
  const updateUserUrl = '/api/user';

  describe('given a valid request', () => {
    test('given all fields set should return http status code 200 and the user', async () => {
      const user = await usersClient.registerRandomUser();

      const requestBody = {
        user: {
          email: faker.internet.email(),
          username: faker.internet.userName(),
          password: faker.internet.password(),
          bio: faker.lorem.paragraphs(),
          image: faker.internet.url(),
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${user.user.token}`)
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        user: {
          email: requestBody.user.email,
          username: requestBody.user.username,
          token: expect.not.toBeEmpty(),
          bio: requestBody.user.bio,
          image: requestBody.user.image,
          darkMode: true,
        },
      });

      const loggeduser = await usersClient.login(
        requestBody.user.email,
        requestBody.user.password
      );

      expect(loggeduser.user).toStrictEqual({
        email: requestBody.user.email,
        username: requestBody.user.username,
        token: expect.not.toBeEmpty(),
        bio: requestBody.user.bio,
        image: requestBody.user.image,
        darkMode: true,
      });
    });

    test('given valid email should return http status code 200 and the user', async () => {
      const user = await usersClient.registerRandomUser();

      const requestBody = {
        user: {
          email: faker.internet.email(),
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${user.user.token}`)
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        user: {
          email: requestBody.user.email,
          username: user.user.username,
          token: expect.not.toBeEmpty(),
          bio: user.user.bio,
          image: user.user.image,
          darkMode: true,
        },
      });

      const loggeduser = await usersClient.login(
        requestBody.user.email,
        user.password
      );

      expect(loggeduser.user).toStrictEqual({
        email: requestBody.user.email,
        username: user.user.username,
        token: expect.not.toBeEmpty(),
        bio: user.user.bio,
        image: user.user.image,
        darkMode: true,
      });
    });

    test('given a same email as the calling user should return http status code 200 and the user', async () => {
      const user = await usersClient.registerRandomUser();

      const requestBody = {
        user: {
          email: user.user.email,
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${user.user.token}`)
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        user: {
          email: user.user.email,
          username: user.user.username,
          token: expect.not.toBeEmpty(),
          bio: user.user.bio,
          image: user.user.image,
          darkMode: true,
        },
      });

      const loggeduser = await usersClient.login(
        user.user.email,
        user.password
      );

      expect(loggeduser.user).toStrictEqual({
        email: user.user.email,
        username: user.user.username,
        token: expect.not.toBeEmpty(),
        bio: user.user.bio,
        image: user.user.image,
        darkMode: true,
      });
    });

    test('given a valid username should return http status code 200 and the user', async () => {
      const user = await usersClient.registerRandomUser();

      const requestBody = {
        user: {
          username: faker.internet.userName(),
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${user.user.token}`)
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        user: {
          email: user.user.email,
          username: requestBody.user.username,
          token: expect.not.toBeEmpty(),
          bio: user.user.bio,
          image: user.user.image,
          darkMode: true,
        },
      });

      const loggeduser = await usersClient.login(
        user.user.email,
        user.password
      );

      expect(loggeduser.user).toStrictEqual({
        email: user.user.email,
        username: requestBody.user.username,
        token: expect.not.toBeEmpty(),
        bio: user.user.bio,
        image: user.user.image,
        darkMode: true,
      });
    });

    test('given the same username as the calling user should return http status code 200 and the user', async () => {
      const user = await usersClient.registerRandomUser();

      const requestBody = {
        user: {
          username: user.user.username,
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${user.user.token}`)
        .send(requestBody);

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        user: {
          email: user.user.email,
          username: user.user.username,
          token: expect.not.toBeEmpty(),
          bio: user.user.bio,
          image: user.user.image,
          darkMode: true,
        },
      });

      const loggeduser = await usersClient.login(
        user.user.email,
        user.password
      );

      expect(loggeduser.user).toStrictEqual({
        email: user.user.email,
        username: user.user.username,
        token: expect.not.toBeEmpty(),
        bio: user.user.bio,
        image: user.user.image,
        darkMode: true,
      });
    });
  });

  test('given a valid password should return http status code 200 and the user', async () => {
    const user = await usersClient.registerRandomUser();

    const requestBody = {
      user: {
        password: faker.internet.password(),
      },
    };

    const response = await request(app)
      .put(updateUserUrl)
      .set('authorization', `Token ${user.user.token}`)
      .send(requestBody);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      user: {
        email: user.user.email,
        username: user.user.username,
        token: expect.not.toBeEmpty(),
        bio: user.user.bio,
        image: user.user.image,
        darkMode: true,
      },
    });

    const loggeduser = await usersClient.login(
      user.user.email,
      requestBody.user.password
    );

    expect(loggeduser.user).toStrictEqual({
      email: user.user.email,
      username: user.user.username,
      token: expect.not.toBeEmpty(),
      bio: user.user.bio,
      image: user.user.image,
      darkMode: true,
    });
  });

  test('given a valid bio should return http status code 200 and the user', async () => {
    const user = await usersClient.registerRandomUser();

    const requestBody = {
      user: {
        bio: faker.lorem.paragraphs(),
      },
    };

    const response = await request(app)
      .put(updateUserUrl)
      .set('authorization', `Token ${user.user.token}`)
      .send(requestBody);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      user: {
        email: user.user.email,
        username: user.user.username,
        token: expect.not.toBeEmpty(),
        bio: requestBody.user.bio,
        image: user.user.image,
        darkMode: true,
      },
    });

    const loggeduser = await usersClient.login(user.user.email, user.password);

    expect(loggeduser.user).toStrictEqual({
      email: user.user.email,
      username: user.user.username,
      token: expect.not.toBeEmpty(),
      bio: requestBody.user.bio,
      image: user.user.image,
      darkMode: true,
    });
  });

  test('given a valid image should return http status code 200 and the user', async () => {
    const user = await usersClient.registerRandomUser();

    const requestBody = {
      user: {
        image: faker.internet.url(),
      },
    };

    const response = await request(app)
      .put(updateUserUrl)
      .set('authorization', `Token ${user.user.token}`)
      .send(requestBody);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      user: {
        email: user.user.email,
        username: user.user.username,
        token: expect.not.toBeEmpty(),
        bio: user.user.bio,
        image: requestBody.user.image,
        darkMode: true,
      },
    });

    const loggeduser = await usersClient.login(user.user.email, user.password);

    expect(loggeduser.user).toStrictEqual({
      email: user.user.email,
      username: user.user.username,
      token: expect.not.toBeEmpty(),
      bio: user.user.bio,
      image: requestBody.user.image,
      darkMode: true,
    });
  });

  test('given an empty bio should clear it', async () => {
    const user = await usersClient.registerRandomUser();

    const response = await request(app)
      .put(updateUserUrl)
      .set('authorization', `Token ${user.user.token}`)
      .send({user: {bio: ''}});

    expect(response.status).toBe(200);
    expect(response.body.user.bio).toBeNull();
  });

  describe('email validation', () => {
    test('given an invalid email should return http status code 422 and an errors object', async () => {
      const user = await usersClient.registerRandomUser();

      const requestBody = {
        user: {
          email: 'invalid',
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${user.user.token}`)
        .send(requestBody);

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['Enter a valid email address, like name@example.com.'],
        },
      });
    });

    test('given email is taken should return http status code 422 and an errors object', async () => {
      const user = await usersClient.registerRandomUser();
      const anotheruser = await usersClient.registerRandomUser();

      const requestBody = {
        user: {
          email: anotheruser.user.email,
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${user.user.token}`)
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
    test('given username is taken should return http status code 422 and an errors object', async () => {
      const user = await usersClient.registerRandomUser();
      const anotheruser = await usersClient.registerRandomUser();

      const requestBody = {
        user: {
          username: anotheruser.user.username,
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${user.user.token}`)
        .send(requestBody);

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['That username is taken. Try another one.'],
        },
      });
    });
  });

  describe('authentication errors', () => {
    test('given no authentication should return http status code 401 and an errors object', async () => {
      const requestBody = {
        user: {
          email: faker.internet.email(),
          username: faker.internet.userName(),
          password: faker.internet.password(),
          bio: faker.lorem.paragraphs(),
          image: faker.internet.url(),
        },
      };

      const response = await request(app).put(updateUserUrl).send(requestBody);

      expect(response.status).toBe(401);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['unauthorized'],
        },
      });
    });

    test('given user is not found should return http status code 401 and an errors object', async () => {
      const token = jwt.getRandomToken();

      const requestBody = {
        user: {
          email: faker.internet.email(),
          username: faker.internet.userName(),
          password: faker.internet.password(),
          bio: faker.lorem.paragraphs(),
          image: faker.internet.url(),
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${token}`)
        .send(requestBody);

      expect(response.status).toBe(401);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['unauthorized'],
        },
      });
    });

    test('given token has wrong issuer should return http status code 401 and an errors object', async () => {
      const issuer = faker.internet.url();

      const token = jwt.getRandomToken({issuer});

      const requestBody = {
        user: {
          email: faker.internet.email(),
          username: faker.internet.userName(),
          password: faker.internet.password(),
          bio: faker.lorem.paragraphs(),
          image: faker.internet.url(),
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${token}`)
        .send(requestBody);

      expect(response.status).toBe(401);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['unauthorized'],
        },
      });
    });

    test('given token is expired should return http status code 401 and an errors object', async () => {
      const user = await usersClient.registerRandomUser();

      const expiresInSeconds = 1;

      const token = jwt.getRandomToken({
        subject: user.user.id,
        expiresInSeconds,
      });

      await new Promise(r => setTimeout(r, expiresInSeconds * 1000 + 1));

      const requestBody = {
        user: {
          email: faker.internet.email(),
          username: faker.internet.userName(),
          password: faker.internet.password(),
          bio: faker.lorem.paragraphs(),
          image: faker.internet.url(),
        },
      };

      const response = await request(app)
        .put(updateUserUrl)
        .set('authorization', `Token ${token}`)
        .send(requestBody);

      expect(response.status).toBe(401);
      expect(response.body).toStrictEqual({
        errors: {
          body: ['unauthorized'],
        },
      });
    });
  });
});

describe('PUT /api/user darkMode', () => {
  const updateUserUrl = '/api/user';

  test('is dark until turned off, then saved and returned on every sign-in', async () => {
    const password = faker.internet.password();
    const email = faker.internet.email();
    const registered = await usersClient.registerUser(
      email,
      faker.internet.userName(),
      password
    );
    expect(registered.user.darkMode).toBe(true);

    const response = await request(app)
      .put(updateUserUrl)
      .set('authorization', `Token ${registered.user.token}`)
      .send({user: {darkMode: false}});

    expect(response.status).toBe(200);
    expect(response.body.user.darkMode).toBe(false);

    const loggedIn = await usersClient.login(email, password);
    expect(loggedIn.user.darkMode).toBe(false);

    // Other updates leave it as it is.
    const bioUpdate = await request(app)
      .put(updateUserUrl)
      .set('authorization', `Token ${registered.user.token}`)
      .send({user: {bio: 'Scholar'}});
    expect(bioUpdate.body.user.darkMode).toBe(false);

    const current = await request(app)
      .get('/api/user')
      .set('authorization', `Token ${registered.user.token}`);
    expect(current.body.user.darkMode).toBe(false);
  });

  test('refuses anything but true or false', async () => {
    const user = await usersClient.registerRandomUser();

    const response = await request(app)
      .put(updateUserUrl)
      .set('authorization', `Token ${user.user.token}`)
      .send({user: {darkMode: 'dim'}});

    expect(response.status).toBe(422);
  });
});
