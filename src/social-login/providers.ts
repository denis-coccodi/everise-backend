import {URLSearchParams} from 'url';

// How the app calls Google's and Facebook's APIs (the parts of fetch it
// uses); tests pass a fake.
type OAuthFetch = (
  url: string,
  init?: {method?: string; headers?: Record<string, string>; body?: string}
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

const PROVIDERS = ['google', 'facebook'] as const;
type Provider = typeof PROVIDERS[number];

// An app registered with the provider (Google Cloud console, Meta for
// Developers). Unset means that sign-in button isn't offered.
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
  | 'cancelled'
  | 'expired'
  | 'no-email'
  | 'failed'
  | 'unavailable';

class SocialLoginError extends Error {
  constructor(readonly problem: SocialLoginProblem, detail: string) {
    super(detail);
  }
}

const GRAPH = 'https://graph.facebook.com/v23.0';

const AUTHORIZE_URLS: Record<Provider, string> = {
  google: 'https://accounts.google.com/o/oauth2/v2/auth',
  facebook: 'https://www.facebook.com/v23.0/dialog/oauth',
};

const SCOPES: Record<Provider, string> = {
  google: 'openid email profile',
  facebook: 'email public_profile',
};

// The provider's sign-in page, which sends the person back to redirectUri
// with a one-time code and the state.
function authorizeUrl(
  provider: Provider,
  clientId: string,
  redirectUri: string,
  state: string
) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES[provider],
    state,
  });
  if (provider === 'google') {
    // Lets someone with several Google accounts choose which one.
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
  fetchFn: OAuthFetch
): Promise<ProviderProfile> {
  return provider === 'google'
    ? googleProfile(app, code, redirectUri, fetchFn)
    : facebookProfile(app, code, redirectUri, fetchFn);
}

async function googleProfile(
  app: Required<ProviderApp>,
  code: string,
  redirectUri: string,
  fetchFn: OAuthFetch
): Promise<ProviderProfile> {
  const token = await json<{access_token?: string}>(
    'Google: exchanging the code',
    fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        code,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    })
  );
  const info = await json<{
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  }>(
    'Google: reading the profile',
    fetchFn('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {Authorization: `Bearer ${token.access_token}`},
    })
  );
  if (!info.sub) {
    throw new SocialLoginError('failed', 'Google sent no account id');
  }
  return {
    id: info.sub,
    // A Google account can carry an address its owner never confirmed.
    email: info.email_verified ? info.email : undefined,
    name: info.name,
  };
}

async function facebookProfile(
  app: Required<ProviderApp>,
  code: string,
  redirectUri: string,
  fetchFn: OAuthFetch
): Promise<ProviderProfile> {
  const token = await json<{access_token?: string}>(
    'Facebook: exchanging the code',
    fetchFn(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: redirectUri,
        code,
      })}`
    )
  );
  // Facebook only shares an address its owner confirmed, and none for
  // accounts made with a phone number.
  const me = await json<{id?: string; email?: string; name?: string}>(
    'Facebook: reading the profile',
    fetchFn(
      `${GRAPH}/me?${new URLSearchParams({
        fields: 'id,name,email',
        access_token: token.access_token ?? '',
      })}`
    )
  );
  if (!me.id) {
    throw new SocialLoginError('failed', 'Facebook sent no account id');
  }
  return {id: me.id, email: me.email, name: me.name};
}

async function json<T>(
  step: string,
  pending: ReturnType<OAuthFetch>
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
