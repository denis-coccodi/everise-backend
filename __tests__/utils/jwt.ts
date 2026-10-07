import * as jwt from 'jsonwebtoken';
import {faker} from '@faker-js/faker';
import {config} from '../../src/config';

interface RandomTokenOptions {
  subject?: string;
  issuer?: string;
  expiresInSeconds?: number;
}

function getRandomToken(options?: RandomTokenOptions) {
  const signOptions: jwt.SignOptions = {
    subject: faker.datatype.uuid(),
    issuer: config.jwt.issuer,
    expiresIn: config.jwt.secondsToExpiration,
  };

  if (options) {
    if (options.subject) {
      signOptions.subject = options.subject;
    }

    if (options.issuer) {
      signOptions.issuer = options.issuer;
    }

    if (options.expiresInSeconds) {
      signOptions.expiresIn = options.expiresInSeconds;
    }
  }

  const token = jwt.sign({}, config.jwt.secretKey, signOptions);

  return token;
}

export {getRandomToken};
