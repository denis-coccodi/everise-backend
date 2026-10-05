import {randomBytes} from 'crypto';
import * as express from 'express';
import {MissingEmailError} from '../errors';
import {JWTService, UsersService} from '../users';
import {setSessionCookie} from '../users/users-router';
import {
  OAuthFetch,
  PROVIDERS,
  Provider,
  SocialLoginError,
  SocialLoginProblem,
  SocialLoginSettings,
  authorizeUrl,
  fetchProfile,
  isProvider,
} from './providers';

// Remembers, for the trip to the provider and back, which sign-in this
// browser started: a random state the provider must send back, so nobody can
// slip their own Google or Facebook account into someone else's browser.
const STATE_COOKIE = 'social_login';
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  // Sent on the provider's redirect back, a top-level navigation.
  sameSite: 'lax' as const,
  path: '/api/auth',
};
const STATE_SECONDS = 10 * 60;

// Sign-in and sign-up with Google or Facebook, in one: the person picks an
// account with the provider, which sends them back here; they're signed in
// to the Everise account tied to it, or with the same email, or a new one.
// The session is the same cookie a password sign-in sets.
class SocialLoginRouter {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JWTService,
    private readonly settings: SocialLoginSettings,
    // The site people use; the providers send them back to its /api.
    private readonly siteUrl: string,
    private readonly fetchFn: OAuthFetch = (url, init) =>
      (fetch as unknown as OAuthFetch)(url, init)
  ) {}

  get router() {
    const router = express.Router();

    // The providers this backend is set up for, so the site shows only
    // their buttons.
    router.get('/auth/providers', (_req, res) =>
      res.json({providers: PROVIDERS.filter(p => this.app(p))})
    );

    router.get('/auth/:provider', (req, res) => {
      const provider = req.params.provider;
      const app = isProvider(provider) && this.app(provider);
      if (!app) {
        return res.redirect(this.problemUrl('unavailable'));
      }

      const state = randomBytes(32).toString('base64url');
      res.cookie(STATE_COOKIE, `${provider}.${state}`, {
        ...STATE_COOKIE_OPTIONS,
        maxAge: 1000 * STATE_SECONDS,
      });
      return res.redirect(
        authorizeUrl(provider, app.clientId, this.redirectUri(provider), state)
      );
    });

    router.get('/auth/:provider/callback', async (req, res) => {
      const provider = req.params.provider;
      const started = req.cookies?.[STATE_COOKIE] as string | undefined;
      res.clearCookie(STATE_COOKIE, STATE_COOKIE_OPTIONS);

      try {
        const app = isProvider(provider) && this.app(provider);
        if (!app) {
          throw new SocialLoginError(
            'unavailable',
            `${provider} is not set up`
          );
        }
        if (req.query.error) {
          throw new SocialLoginError(
            'cancelled',
            `${provider} answered ${req.query.error}`
          );
        }
        const {code, state} = req.query;
        if (
          typeof code !== 'string' ||
          typeof state !== 'string' ||
          started !== `${provider}.${state}`
        ) {
          throw new SocialLoginError(
            'expired',
            `${provider}: the state doesn't match the one this browser started`
          );
        }

        const profile = await fetchProfile(
          provider,
          app,
          code,
          this.redirectUri(provider),
          this.fetchFn
        );
        const {user} = await this.usersService.signInWithProvider({
          provider,
          ...profile,
        });

        setSessionCookie(
          res,
          this.jwtService.getToken(user),
          this.jwtService.secondsToExpiration
        );
        return res.redirect(`${this.siteUrl}/`);
      } catch (err) {
        const problem: SocialLoginProblem =
          err instanceof SocialLoginError
            ? err.problem
            : err instanceof MissingEmailError
            ? 'no-email'
            : 'failed';
        if (problem === 'failed') {
          console.error(`Social sign-in failed: ${(err as Error).message}`);
        }
        return res.redirect(this.problemUrl(problem));
      }
    });

    return router;
  }

  // The provider's app, when both of its settings are there.
  private app(provider: Provider) {
    const {clientId, clientSecret} = this.settings[provider];
    return clientId && clientSecret ? {clientId, clientSecret} : undefined;
  }

  // Registered with the provider as the app's only allowed return address.
  private redirectUri(provider: Provider) {
    return `${this.siteUrl}/api/auth/${provider}/callback`;
  }

  // The sign-in page, which explains what went wrong.
  private problemUrl(problem: SocialLoginProblem) {
    return `${this.siteUrl}/login?social=${problem}`;
  }
}

export {SocialLoginRouter, STATE_COOKIE};
