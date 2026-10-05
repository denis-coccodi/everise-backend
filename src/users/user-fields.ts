import {Joi} from 'celebrate';

// The user fields of the sign-up, sign-in and settings forms, with messages
// written for the person filling them in (the app shows them as they are).

const email = () =>
  Joi.string().email().messages({
    'any.required': 'Enter your email address.',
    'string.empty': 'Enter your email address.',
    'string.email': 'Enter a valid email address, like name@example.com.',
    'string.base': 'Enter a valid email address, like name@example.com.',
  });

const username = () =>
  Joi.string().messages({
    'any.required': 'Choose a username.',
    'string.empty': 'Choose a username.',
    'string.base': 'Choose a username.',
  });

// For sign-up and settings; signing in uses signInPassword.
const newPassword = () =>
  Joi.string().messages({
    'any.required': 'Choose a password.',
    'string.empty': 'Choose a password.',
    'string.base': 'Choose a password.',
  });

const signInPassword = () =>
  Joi.string().messages({
    'any.required': 'Enter your password.',
    'string.empty': 'Enter your password.',
    'string.base': 'Enter your password.',
  });

// The API returns no bio as null, so clients may send that back: it clears it.
const bio = () => Joi.string().allow('', null);

const image = () =>
  Joi.string()
    .uri()
    .messages({'string.uri': 'The picture must be a web address.'});

// Report every field's problem at once, not only the first.
const ALL_ERRORS = {abortEarly: false};

export {ALL_ERRORS, bio, email, image, newPassword, signInPassword, username};
