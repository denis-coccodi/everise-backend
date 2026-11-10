---
title: Authentication
nav_order: 5
---

# Authentication and account security

Frontend: [Accounts and sign-in](/docs/frontend/features/accounts.html).

## Tokens and sessions

- **Signing in** (or opening an email confirmation link) returns a JWT in the body and also sets it in an `httpOnly`, `Secure` cookie named `token`.
- **Protected endpoints** accept that cookie or an `Authorization: Token <jwt>` (or `Bearer <jwt>`) header. `POST /api/users/logout` clears the cookie.
- **Session version:** each token carries the account's `sessionVersion`. Changing or resetting the password, or `POST /api/users/logout-everywhere`, raises it, so every older token stops working (401).
- **Email addresses** sign in, and are checked for sign-up, in any letter case.
- **The cookie's `SameSite`** comes from `COOKIE_SAME_SITE`. Use `none` while the frontend is on another site; use `strict` once the frontend and the API share one origin, as they do through the frontend Worker's service binding.

## Passwords

- **Rules:** 8 to 72 characters (bcrypt reads only 72 bytes), and not found in a known data leak. No required symbols or digits, no expiry. The leak check asks Have I Been Pwned, sending only the first 5 characters of the password's SHA-1 (`src/users/leaked-passwords.ts`).
- **Storage:** bcrypt hashes with cost 8 (`src/users/passwords.ts`). Each step up doubles every sign-in's CPU, and a Worker on the free plan has 10 ms per request.
- **Wrong passwords:** after 10 for one email address within 15 minutes, sign-in answers 429 with `Retry-After` until the 15 minutes are over, even with the right password (`signInFailures`, `src/users/sign-in-limit.ts`).
- **Changing it in Settings** (`PUT /api/user` with `password`) needs `currentPassword`, as does a new email address. The answer sets a new session cookie for this device, every other device is signed out, and the member gets an email.
- **Forgot password** (`src/users/password-reset.ts`): `POST /api/users/password-reset` emails a code (`ABCD-EFGH`) and a link to a confirmed account. It answers 202 whether or not there is one. `POST /api/users/password-reset/confirm` with `{code, password}` sets the new password.

## Email confirmation

Active when `RESEND_API_KEY` is set (`src/users/email-confirmation.ts`).

- **Sign-up with a password** answers `201 {"confirmation": {"email"}}` and signs nobody in. The account gets `emailConfirmed: false` and an email with a link to `BASE_URL/confirm-email?token=…`. The site posts the token to `POST /api/users/confirm-email`, which confirms the address and signs in.
- **Links:**
  - a link works once, for 24 hours;
  - links can be sent once a minute and five times a day per account;
  - only a SHA-256 hash of each token is stored (`emailConfirmations`).
- **Unconfirmed sign-ups** don't hold an address. Signing up again with it replaces the earlier sign-up, and after 7 days its username is free again.
- **A new address set in Settings** waits as `pendingEmail` until its own link is opened.
- **Provider sign-ins** count as confirmed. Accounts from before email confirmation count as confirmed.
- **Locally,** `RESEND_API_KEY=console` prints the emails in the terminal.

Emails are sent through Resend from `EMAIL_FROM`, on the verified `everise.dev` domain.

## Bot check (Turnstile)

When `TURNSTILE_SECRET_KEY` is set, these need a Cloudflare Turnstile token: sign-up, password sign-in, resending a confirmation link, and requesting or using a reset code. When first turning it on, deploy the frontend before the backend, so the forms already send the token. The smoke test can't pass the check, so with it on it only checks that a sign-up without a token is refused.

## Google and Discord

One button per provider both signs in and signs up (`src/social-login`). The backend runs the whole OAuth authorization code flow, so the site loads none of the providers' scripts.

1. The site links to `GET /api/auth/<provider>`. The backend sets a short-lived `social_login` cookie holding a random state, and redirects to the provider.
2. The provider sends the browser back to `BASE_URL/api/auth/<provider>/callback` with a code and the state. A state that doesn't match the cookie is refused.
3. The backend exchanges the code for the person's profile, server to server, and picks the account:
   - the account already tied to that provider account (`googleId` or `discordId`);
   - else the account with the same confirmed email, which is then tied to it;
   - else a new account, named after the person, with a number added when the name is taken.
4. It sets the `token` cookie and redirects to the site. Problems redirect to `/login?social=<problem>` (`cancelled`, `expired`, `no-email`, `failed`, `unavailable`).

Only confirmed provider emails are used (Google's `email_verified`, Discord's `verified`). The user object carries `signInMethods`, for example `["password", "google"]`.

## Roles

| Role | Who |
|---|---|
| `user` | Everyone who registers |
| `staging-tester` | Given by an admin; may open the staging site |
| `admin` | Whoever's email is in the `ADMIN_EMAILS` secret. Never stored, so it can't be given or removed through the API |
