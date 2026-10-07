import {z} from 'zod';

// The user fields of the sign-up, sign-in and settings forms, with messages
// written for the person filling them in (the app shows them as they are).

// Text that must be there: `missing` when it's absent or empty, `invalid`
// when it's something other than text.
const requiredText = (missing: string, invalid = missing) =>
  z
    .string({error: issue => (issue.input === undefined ? missing : invalid)})
    .min(1, {error: missing});

const email = () =>
  z.email({
    error: issue =>
      issue.input === undefined || issue.input === ''
        ? 'Enter your email address.'
        : 'Enter a valid email address, like name@example.com.',
  });

const username = () => requiredText('Choose a username.');

// For sign-up and settings; signing in uses signInPassword.
const newPassword = () => requiredText('Choose a password.');

const signInPassword = () => requiredText('Enter your password.');

// The API returns no bio as null, so clients may send that back: it clears it.
const bio = () => z.string().nullable();

// A picture's web address (http or https only).
const image = () =>
  z.url({
    protocol: /^https?$/,
    error: 'The picture must be a web address.',
  });

export {bio, email, image, newPassword, signInPassword, username};
