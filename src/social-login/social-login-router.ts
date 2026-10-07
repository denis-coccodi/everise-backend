import {randomBytes} from 'crypto';
import * as express from 'express';
import {z} from 'zod';
import {route, responseSchema} from '../api';
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
// slip their own provider account into someone else's browser.
const STATE_COOKIE = 'social_login';
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  // Sent on the provider's redirect back, a top-level navigation.
  sameSite: 'lax' as const,
  path: '/api/auth',
};
const STATE_SECONDS = 10 * 60;

const ProvidersResponse = responseSchema(
  'ProvidersResponse',
  z.strictObject({
    providers: z.array(z.enum(['google', 'facebook', 'microsoft', 'discord'])),
  }),
);

// What the provider sends back. Never a 422: whatever arrives, the person is
// sent on to the site, signed in or with what went wrong.
const lenient = z.string().optional().catch(undefined);
const CallbackQuery = z.object({
  code: lenient,
  state: lenient,
  // Set when the person cancelled or the provider refused.
  error: lenient,
});

// Sign-in and sign-up with Google, Facebook, Microsoft or Discord, in one: the person picks an
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
      (fetch as unknown as OAuthFetch)(url, init),
  ) {}

  get router() {
    const router = express.Router();

    // The providers this backend is set up for, so the site shows only
    // their buttons.
    route(
      router,
      {
        method: 'get',
        path: '/auth/providers',
        summary: 'The sign-in providers set up on this backend',
        responses: {
          200: {description: 'Their names.', schema: ProvidersResponse},
        },
      },
      (_req, res) => {
        res.json({providers: PROVIDERS.filter(p => this.app(p))});
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/auth/:provider',
        summary: 'Sign in with a provider (a page to open, not to fetch)',
        responses: {302: {description: "To the provider's sign-in page."}},
      },
      (req, res) => {
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
          authorizeUrl(
            provider,
            app.clientId,
            this.redirectUri(provider),
            state,
          ),
        );
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/auth/:provider/callback',
        summary: 'Where the provider sends people back (not to fetch)',
        query: CallbackQuery,
        responses: {
          302: {description: 'To the site, signed in, or to the sign-in page.'},
        },
      },
      async (req, res) => {
        const provider = req.params.provider;
        const started = req.cookies?.[STATE_COOKIE] as string | undefined;
        res.clearCookie(STATE_COOKIE, STATE_COOKIE_OPTIONS);

        try {
          const app = isProvider(provider) && this.app(provider);
          if (!app) {
            throw new SocialLoginError(
              'unavailable',
              `${provider} is not set up`,
            );
          }
          if (req.query.error) {
            throw new SocialLoginError(
              'cancelled',
              `${provider} answered ${req.query.error}`,
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
              `${provider}: the state doesn't match the one this browser started`,
            );
          }

          const profile = await fetchProfile(
            provider,
            app,
            code,
            this.redirectUri(provider),
            this.fetchFn,
          );
          const {user} = await this.usersService.signInWithProvider({
            provider,
            ...profile,
          });

          setSessionCookie(
            res,
            this.jwtService.getToken(user),
            this.jwtService.secondsToExpiration,
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
      },
    );

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
