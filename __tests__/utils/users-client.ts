import {faker} from '@faker-js/faker';
import * as assert from 'node:assert';
import request from 'supertest';
import {app, lastConfirmationToken} from './app';

interface UpdateUserParams {
  email?: string;
  username?: string;
  password?: string;
  bio?: string;
  image?: string;
}

class UsersClient {
  constructor() {}

  async registerUser(email: string, username: string, password: string) {
    const requestBody = {
      user: {
        email,
        username,
        password,
      },
    };

    const response = await request(app).post('/api/users').send(requestBody);

    assert.strictEqual(response.statusCode, 201);

    return {
      ...(await this.confirmEmail(email)),
      password,
    };
  }

  // Opens the last confirmation link sent to `email`, which signs in.
  async confirmEmail(email: string) {
    const confirmed = await request(app)
      .post('/api/users/confirm-email')
      .send({token: lastConfirmationToken(email)});

    assert.strictEqual(confirmed.statusCode, 200);

    return confirmed.body;
  }

  async registerRandomUser() {
    const email = faker.internet.email();
    const username = faker.internet.userName();
    const password = faker.internet.password();

    const registeredUser = await this.registerUser(email, username, password);

    const updateUserParams = {
      bio: faker.lorem.paragraphs(),
      // internet.url() can return non-ASCII hosts (e.g. "jalapeño.com"),
      // which fail the API's URI validation.
      image: faker.internet.avatar(),
    };

    const updatedUser = await this.updateUser(
      registeredUser.user.token,
      updateUserParams
    );

    return {
      ...updatedUser,
      password,
    };
  }

  async login(email: string, password: string) {
    const requestBody = {
      user: {
        email,
        password,
      },
    };

    const response = await request(app)
      .post('/api/users/login')
      .send(requestBody);

    assert.strictEqual(response.statusCode, 200);

    return {
      ...response.body,
      password,
    };
  }

  async updateUser(token: string, params: UpdateUserParams) {
    const requestBody = {
      user: params,
    };

    const response = await request(app)
      .put('/api/user')
      .set('authorization', `Token ${token}`)
      .send(requestBody);

    assert.strictEqual(response.statusCode, 200);

    return response.body;
  }
}

const usersClient = new UsersClient();

export {usersClient};
