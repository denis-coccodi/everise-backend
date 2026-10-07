import {z} from 'zod';

const envVarsSchema = z.object({
  BASE_URL: z.url(),
  // Comma-separated addresses the site had before BASE_URL. Pictures and
  // uploads saved under them are still the site's own (src/site-urls.ts).
  LEGACY_BASE_URLS: z.string().default(''),
  CORS_ORIGINS: z.string().min(1),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('none'),
  JWT_SECRET_KEY: z.string().min(1),
  JWT_ISSUER: z.url(),
  JWT_SECONDS_TO_EXPIRATION: z.coerce.number().int(),
  // Allows POST /api/duties/refresh; when unset, refreshing is disabled.
  DUTIES_REFRESH_KEY: z.string().optional(),
  // Comma-separated emails of the admins. A secret, so the addresses stay
  // out of the repository; without it nobody is an admin.
  ADMIN_EMAILS: z.string().default(''),
  // Keeps the Cloudflare Access policy of staging testers in step with the
  // staging-tester role. Set on one backend only (production): each
  // backend would otherwise write its own testers into the same policy.
  CF_ACCESS_API_TOKEN: z.string().optional(),
  CF_ACCOUNT_ID: z.string().optional(),
  CF_ACCESS_POLICY_ID: z.string().optional(),
  // The setting's earlier name, still read when CF_ACCESS_POLICY_ID isn't set.
  CF_ACCESS_GROUP_ID: z.string().optional(),
  // Sign-in with Google, Facebook, Microsoft and Discord: each needs its
  // app's id and secret (Google Cloud console, Meta for Developers,
  // Microsoft Entra, Discord Developer Portal); without them, that button
  // isn't shown.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  // Announces new posts in a Discord channel (the channel's webhook
  // address, a secret); without it nothing is announced.
  DISCORD_WEBHOOK_URL: z.union([z.url(), z.literal('')]).optional(),
  // The Discord server whose widget the home page shows.
  DISCORD_GUILD_ID: z.string().optional(),
  // The GIF search in posts and comments (GIPHY's API key); without it the
  // search isn't offered.
  GIPHY_API_KEY: z.string().optional(),
  // Email confirmation at sign-up and on a new address: Resend's API key
  // (a secret) and the sender, on a domain verified at Resend. Without the
  // key, emails aren't confirmed.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(1).default('Everise <noreply@everise.dev>'),
  // The Workers AI Neurons the Waking Sands may spend a day. The account's
  // free 10,000 are shared by staging and production, so the two settings
  // together must stay under them. 0 (the default) keeps the chat closed.
  WAKING_SANDS_DAILY_NEURONS: z.coerce.number().int().min(0).default(0),
  // Checks every response against its route's schema (src/api), failing
  // with a 500 when they differ. On in the tests, off when deployed.
  CHECK_API_RESPONSES: z.stringbool().default(false),
});

const parsed = envVarsSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid settings:
${z.prettifyError(parsed.error)}`);
}
const envVars = parsed.data;

const config = {
  baseUrl: envVars.BASE_URL,
  legacyBaseUrls: envVars.LEGACY_BASE_URLS.split(',')
    .map(url => url.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  corsOrigins: envVars.CORS_ORIGINS.split(','),
  cookieSameSite: envVars.COOKIE_SAME_SITE,
  jwt: {
    secretKey: envVars.JWT_SECRET_KEY,
    issuer: envVars.JWT_ISSUER,
    secondsToExpiration: envVars.JWT_SECONDS_TO_EXPIRATION,
  },
  dutiesRefreshKey: envVars.DUTIES_REFRESH_KEY,
  adminEmails: envVars.ADMIN_EMAILS.split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean),
  socialLogin: {
    google: {
      clientId: envVars.GOOGLE_CLIENT_ID,
      clientSecret: envVars.GOOGLE_CLIENT_SECRET,
    },
    facebook: {
      clientId: envVars.FACEBOOK_APP_ID,
      clientSecret: envVars.FACEBOOK_APP_SECRET,
    },
    microsoft: {
      clientId: envVars.MICROSOFT_CLIENT_ID,
      clientSecret: envVars.MICROSOFT_CLIENT_SECRET,
    },
    discord: {
      clientId: envVars.DISCORD_CLIENT_ID,
      clientSecret: envVars.DISCORD_CLIENT_SECRET,
    },
  },
  discord: {
    webhookUrl: envVars.DISCORD_WEBHOOK_URL,
    guildId: envVars.DISCORD_GUILD_ID,
  },
  giphyApiKey: envVars.GIPHY_API_KEY,
  email: {
    resendApiKey: envVars.RESEND_API_KEY,
    from: envVars.EMAIL_FROM,
  },
  wakingSandsDailyNeurons: envVars.WAKING_SANDS_DAILY_NEURONS,
  checkApiResponses: envVars.CHECK_API_RESPONSES,
  stagingAccess: {
    apiToken: envVars.CF_ACCESS_API_TOKEN,
    accountId: envVars.CF_ACCOUNT_ID,
    policyId: envVars.CF_ACCESS_POLICY_ID || envVars.CF_ACCESS_GROUP_ID,
  },
};

export {config};
