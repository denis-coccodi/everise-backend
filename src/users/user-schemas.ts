import {z} from 'zod';
import {requestSchema, responseSchema} from '../api';
import {
  bio,
  email,
  image,
  newPassword,
  signInPassword,
  username,
} from './user-fields';

// The signed-in user, as the settings and the session see them.
const UserSchema = responseSchema(
  'User',
  z.strictObject({
    id: z.string(),
    email: z.string(),
    username: z.string(),
    // For the Authorization header (`Token <token>`); browsers also get it
    // as the session cookie.
    token: z.string(),
    bio: z.string().nullable(),
    // Their picture's address; a default one when they have none.
    image: z.string(),
    darkMode: z.boolean(),
    role: z.enum(['admin', 'staging-tester', 'user']),
    // How the account can be signed in to, e.g. ["password", "google"].
    signInMethods: z.array(
      z.enum(['password', 'google', 'facebook', 'microsoft', 'discord']),
    ),
    // A new address from the settings, until its link is opened.
    pendingEmail: z.string().nullable(),
  }),
);

const UserResponse = responseSchema(
  'UserResponse',
  z.strictObject({user: UserSchema}),
);

// A sign-up (or new address) waiting for its email link: sent to `email`.
const ConfirmationResponse = responseSchema(
  'ConfirmationResponse',
  z.strictObject({confirmation: z.strictObject({email: z.string()})}),
);

// Signed in at once, or a link to open first when emails are confirmed.
const RegistrationResponse = responseSchema(
  'RegistrationResponse',
  z.union([UserResponse, ConfirmationResponse]),
);

// The bot check's token (Cloudflare Turnstile), sent by the sign-up,
// sign-in and resend forms; needed once the backend has Turnstile's secret.
const turnstileToken = () => z.string().max(2048).optional();

const NewUser = requestSchema(
  'NewUser',
  z.object({
    user: z.object({
      email: email(),
      username: username(),
      password: newPassword(),
    }),
    turnstileToken: turnstileToken(),
  }),
);

const LoginUser = requestSchema(
  'LoginUser',
  z.object({
    user: z.object({email: email(), password: signInPassword()}),
    turnstileToken: turnstileToken(),
  }),
);

const EmailConfirmationToken = requestSchema(
  'EmailConfirmationToken',
  z.object({token: z.string().min(1).max(200)}),
);

const ResendConfirmation = requestSchema(
  'ResendConfirmation',
  z.object({
    user: z.object({email: email()}),
    turnstileToken: turnstileToken(),
  }),
);

// The settings: only the fields being changed.
const UserUpdate = requestSchema(
  'UserUpdate',
  z.object({
    user: z.object({
      email: email().optional(),
      username: username().optional(),
      password: newPassword().optional(),
      bio: bio().optional(),
      image: image().optional(),
      darkMode: z.boolean().optional(),
    }),
  }),
);

export {
  ConfirmationResponse,
  EmailConfirmationToken,
  LoginUser,
  NewUser,
  RegistrationResponse,
  ResendConfirmation,
  UserResponse,
  UserUpdate,
};
