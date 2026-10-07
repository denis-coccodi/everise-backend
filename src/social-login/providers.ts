import {URLSearchParams} from 'url';

// How the app calls the sign-in providers' APIs (the parts of fetch it
// uses); tests pass a fake.
type OAuthFetch = (
  url: string,
  init?: {method?: string; headers?: Record<string, string>; body?: string},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

const PROVIDERS = ['google', 'facebook', 'microsoft', 'discord'] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_NAMES: Record<Provider, string> = {
  google: 'Google',
  facebook: 'Facebook',
  microsoft: 'Microsoft',
  discord: 'Discord',
};

// An app registered with the provider (Google Cloud console, Meta for
// Developers, Microsoft Entra, Discord Developer Portal). Unset means that
// sign-in button isn't offered.
interface ProviderApp {
  clientId?: string;
  clientSecret?: string;
}

type SocialLoginSettings = Record<Provider, ProviderApp>;

// Who signed in, as the provider vouches for them.
interface ProviderProfile {
  // The provider's own id for the person, which never changes.
  id: string;
  // Only an address the provider has confirmed belongs to them.
  email?: string;
  name?: string;
}

// Why a sign-in through a provider didn't finish; the sign-in page explains
// each one.
type SocialLoginProblem =
  'cancelled' | 'expired' | 'no-email' | 'failed' | 'unavailable';

class SocialLoginError extends Error {
  constructor(
    readonly problem: SocialLoginProblem,
    detail: string,
  ) {
    super(detail);
  }
}

const GRAPH = 'https://graph.facebook.com/v23.0';

// Microsoft's "consumers" endpoints: personal Microsoft accounts only
// (Outlook, Hotmail, Xbox). Work and school accounts are left out on
// purpose: their organisations can set an email address nobody confirmed,
// which mustn't be trusted to tie accounts together.
const MICROSOFT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';

const DISCORD = 'https://discord.com/api';

const AUTHORIZE_URLS: Record<Provider, string> = {
  google: 'https://accounts.google.com/o/oauth2/v2/auth',
  facebook: 'https://www.facebook.com/v23.0/dialog/oauth',
  microsoft: `${MICROSOFT}/authorize`,
  discord: 'https://discord.com/oauth2/authorize',
};

const SCOPES: Record<Provider, string> = {
  google: 'openid email profile',
  facebook: 'email public_profile',
  microsoft: 'openid email profile',
  discord: 'identify email',
};

// The provider's sign-in page, which sends the person back to redirectUri
// with a one-time code and the state.
function authorizeUrl(
  provider: Provider,
  clientId: string,
  redirectUri: string,
  state: string,
) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES[provider],
    state,
  });
  if (provider === 'google' || provider === 'microsoft') {
    // Lets someone with several accounts choose which one.
    params.set('prompt', 'select_account');
  }
  return `${AUTHORIZE_URLS[provider]}?${params}`;
}

// Trades the one-time code for the person's profile, server to server with
// the app's secret, so the profile comes from the provider itself.
async function fetchProfile(
  provider: Provider,
  app: Required<ProviderApp>,
  code: string,
  redirectUri: string,
  fetchFn: OAuthFetch,
): Promise<ProviderProfile> {
  return PROFILE_READERS[provider](app, code, redirectUri, fetchFn);
}

type ProfileReader = (
  app: Required<ProviderApp>,
  code: string,
  redirectUri: string,
  fetchFn: OAuthFetch,
) => Promise<ProviderProfile>;

// The standard code exchange: a form POST with the app's id and secret.
async function exchangeCode(
  provider: string,
  tokenUrl: string,
  app: Required<ProviderApp>,
  code: string,
  redirectUri: string,
  fetchFn: OAuthFetch,
) {
  const token = await json<{access_token?: string}>(
    `${provider}: exchanging the code`,
    fetchFn(tokenUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        code,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    }),
  );
  return token.access_token ?? '';
}

const PROFILE_READERS: Record<Provider, ProfileReader> = {
  async google(app, code, redirectUri, fetchFn) {
    const accessToken = await exchangeCode(
      'Google',
      'https://oauth2.googleapis.com/token',
      app,
      code,
      redirectUri,
      fetchFn,
    );
    const info = await json<{
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    }>(
      'Google: reading the profile',
      fetchFn('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: {Authorization: `Bearer ${accessToken}`},
      }),
    );
    return {
      id: required('Google', info.sub),
      // A Google account can carry an address its owner never confirmed.
      email: info.email_verified ? info.email : undefined,
      name: info.name,
    };
  },

  async facebook(app, code, redirectUri, fetchFn) {
    const token = await json<{access_token?: string}>(
      'Facebook: exchanging the code',
      fetchFn(
        `${GRAPH}/oauth/access_token?${new URLSearchParams({
          client_id: app.clientId,
          client_secret: app.clientSecret,
          redirect_uri: redirectUri,
          code,
        })}`,
      ),
    );
    // Facebook only shares an address its owner confirmed, and none for
    // accounts made with a phone number.
    const me = await json<{id?: string; email?: string; name?: string}>(
      'Facebook: reading the profile',
      fetchFn(
        `${GRAPH}/me?${new URLSearchParams({
          fields: 'id,name,email',
          access_token: token.access_token ?? '',
        })}`,
      ),
    );
    return {id: required('Facebook', me.id), email: me.email, name: me.name};
  },

  async microsoft(app, code, redirectUri, fetchFn) {
    const accessToken = await exchangeCode(
      'Microsoft',
      `${MICROSOFT}/token`,
      app,
      code,
      redirectUri,
      fetchFn,
    );
    // A personal Microsoft account's email is the address it signs in
    // with, which Microsoft confirmed when the account was made.
    const info = await json<{sub?: string; email?: string; name?: string}>(
      'Microsoft: reading the profile',
      fetchFn('https://graph.microsoft.com/oidc/userinfo', {
        headers: {Authorization: `Bearer ${accessToken}`},
      }),
    );
    return {
      id: required('Microsoft', info.sub),
      email: info.email,
      name: info.name,
    };
  },

  async discord(app, code, redirectUri, fetchFn) {
    const accessToken = await exchangeCode(
      'Discord',
      `${DISCORD}/oauth2/token`,
      app,
      code,
      redirectUri,
      fetchFn,
    );
    const me = await json<{
      id?: string;
      username?: string;
      global_name?: string | null;
      email?: string | null;
      verified?: boolean;
    }>(
      'Discord: reading the profile',
      fetchFn(`${DISCORD}/users/@me`, {
        headers: {Authorization: `Bearer ${accessToken}`},
      }),
    );
    return {
      id: required('Discord', me.id),
      // Discord shares the address even before its owner confirms it.
      email: me.verified ? (me.email ?? undefined) : undefined,
      name: me.global_name || me.username,
    };
  },
};

function required(provider: string, id: string | undefined) {
  if (!id) {
    throw new SocialLoginError('failed', `${provider} sent no account id`);
  }
  return id;
}

async function json<T>(
  step: string,
  pending: ReturnType<OAuthFetch>,
): Promise<T> {
  const response = await pending;
  if (!response.ok) {
    throw new SocialLoginError('failed', `${step} answered ${response.status}`);
  }
  return (await response.json()) as T;
}

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

export {
  OAuthFetch,
  PROVIDERS,
  PROVIDER_NAMES,
  Provider,
  ProviderApp,
  ProviderProfile,
  SocialLoginError,
  SocialLoginProblem,
  SocialLoginSettings,
  authorizeUrl,
  fetchProfile,
  isProvider,
};
