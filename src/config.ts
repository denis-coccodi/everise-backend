import {Joi} from 'celebrate';

const envVarsSchema = Joi.object()
  .keys({
    BASE_URL: Joi.string().uri().required(),
    // Comma-separated addresses the site had before BASE_URL. Pictures and
    // uploads saved under them are still the site's own (src/site-urls.ts).
    LEGACY_BASE_URLS: Joi.string().allow('').default(''),
    CORS_ORIGINS: Joi.string().required(),
    COOKIE_SAME_SITE: Joi.string()
      .valid('strict', 'lax', 'none')
      .default('none'),
    JWT_SECRET_KEY: Joi.string().required(),
    JWT_ISSUER: Joi.string().uri().required(),
    JWT_SECONDS_TO_EXPIRATION: Joi.number().integer().required(),
    // Allows POST /api/duties/refresh; when unset, refreshing is disabled.
    DUTIES_REFRESH_KEY: Joi.string().allow(''),
    // Comma-separated emails of the admins. A secret, so the addresses stay
    // out of the repository; without it nobody is an admin.
    ADMIN_EMAILS: Joi.string().allow('').default(''),
    // Keeps the Cloudflare Access policy of staging testers in step with the
    // staging-tester role. Set on one backend only (production): each
    // backend would otherwise write its own testers into the same policy.
    CF_ACCESS_API_TOKEN: Joi.string().allow(''),
    CF_ACCOUNT_ID: Joi.string().allow(''),
    CF_ACCESS_POLICY_ID: Joi.string().allow(''),
    // The setting's earlier name, still read when CF_ACCESS_POLICY_ID isn't set.
    CF_ACCESS_GROUP_ID: Joi.string().allow(''),
    // Sign-in with Google, Facebook, Microsoft and Discord: each needs its
    // app's id and secret (Google Cloud console, Meta for Developers,
    // Microsoft Entra, Discord Developer Portal); without them, that button
    // isn't shown.
    GOOGLE_CLIENT_ID: Joi.string().allow(''),
    GOOGLE_CLIENT_SECRET: Joi.string().allow(''),
    FACEBOOK_APP_ID: Joi.string().allow(''),
    FACEBOOK_APP_SECRET: Joi.string().allow(''),
    MICROSOFT_CLIENT_ID: Joi.string().allow(''),
    MICROSOFT_CLIENT_SECRET: Joi.string().allow(''),
    DISCORD_CLIENT_ID: Joi.string().allow(''),
    DISCORD_CLIENT_SECRET: Joi.string().allow(''),
    // Announces new posts in a Discord channel (the channel's webhook
    // address, a secret); without it nothing is announced.
    DISCORD_WEBHOOK_URL: Joi.string().uri().allow(''),
    // The Discord server whose widget the home page shows.
    DISCORD_GUILD_ID: Joi.string().allow(''),
    // The GIF search in posts and comments (GIPHY's API key); without it the
    // search isn't offered.
    GIPHY_API_KEY: Joi.string().allow(''),
    // Email confirmation at sign-up and on a new address: Resend's API key
    // (a secret) and the sender, on a domain verified at Resend. Without the
    // key, emails aren't confirmed.
    RESEND_API_KEY: Joi.string().allow(''),
    EMAIL_FROM: Joi.string().default('Everise <noreply@everise.dev>'),
    // The Workers AI Neurons the Waking Sands may spend a day. The account's
    // free 10,000 are shared by staging and production, so the two settings
    // together must stay under them. 0 (the default) keeps the chat closed.
    WAKING_SANDS_DAILY_NEURONS: Joi.number().integer().min(0).default(0),
  })
  .unknown();

const {value: envVars, error} = envVarsSchema.validate(process.env);

if (error) {
  throw error;
}

const config = {
  baseUrl: envVars.BASE_URL,
  legacyBaseUrls: (envVars.LEGACY_BASE_URLS as string)
    .split(',')
    .map(url => url.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  corsOrigins: (envVars.CORS_ORIGINS as string).split(','),
  cookieSameSite: envVars.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
  jwt: {
    secretKey: envVars.JWT_SECRET_KEY,
    issuer: envVars.JWT_ISSUER,
    secondsToExpiration: envVars.JWT_SECONDS_TO_EXPIRATION,
  },
  dutiesRefreshKey: envVars.DUTIES_REFRESH_KEY as string | undefined,
  adminEmails: (envVars.ADMIN_EMAILS as string)
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean),
  socialLogin: {
    google: {
      clientId: envVars.GOOGLE_CLIENT_ID as string | undefined,
      clientSecret: envVars.GOOGLE_CLIENT_SECRET as string | undefined,
    },
    facebook: {
      clientId: envVars.FACEBOOK_APP_ID as string | undefined,
      clientSecret: envVars.FACEBOOK_APP_SECRET as string | undefined,
    },
    microsoft: {
      clientId: envVars.MICROSOFT_CLIENT_ID as string | undefined,
      clientSecret: envVars.MICROSOFT_CLIENT_SECRET as string | undefined,
    },
    discord: {
      clientId: envVars.DISCORD_CLIENT_ID as string | undefined,
      clientSecret: envVars.DISCORD_CLIENT_SECRET as string | undefined,
    },
  },
  discord: {
    webhookUrl: envVars.DISCORD_WEBHOOK_URL as string | undefined,
    guildId: envVars.DISCORD_GUILD_ID as string | undefined,
  },
  giphyApiKey: envVars.GIPHY_API_KEY as string | undefined,
  email: {
    resendApiKey: envVars.RESEND_API_KEY as string | undefined,
    from: envVars.EMAIL_FROM as string,
  },
  wakingSandsDailyNeurons: envVars.WAKING_SANDS_DAILY_NEURONS as number,
  stagingAccess: {
    apiToken: envVars.CF_ACCESS_API_TOKEN as string | undefined,
    accountId: envVars.CF_ACCOUNT_ID as string | undefined,
    policyId: (envVars.CF_ACCESS_POLICY_ID || envVars.CF_ACCESS_GROUP_ID) as
      | string
      | undefined,
  },
};

export {config};
