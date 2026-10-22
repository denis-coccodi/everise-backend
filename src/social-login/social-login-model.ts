import {PROVIDERS} from './providers';

type Provider = (typeof PROVIDERS)[number];

// An app registered with the provider (Google Cloud console, Discord
// Developer Portal). Unset means that sign-in button isn't offered.
interface ProviderApp {
  clientId?: string;
  clientSecret?: string;
}

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

type SocialLoginSettings = Record<Provider, ProviderApp>;

export {
  Provider,
  ProviderApp,
  ProviderProfile,
  SocialLoginProblem,
  SocialLoginSettings,
};
