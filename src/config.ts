import {Joi} from 'celebrate';

const envVarsSchema = Joi.object()
  .keys({
    BASE_URL: Joi.string().uri().required(),
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
    // Keeps the Cloudflare Access group of staging testers in step with the
    // staging-tester role. Set on one backend only (production): each
    // backend would otherwise write its own testers into the same group.
    CF_ACCESS_API_TOKEN: Joi.string().allow(''),
    CF_ACCOUNT_ID: Joi.string().allow(''),
    CF_ACCESS_GROUP_ID: Joi.string().allow(''),
  })
  .unknown();

const {value: envVars, error} = envVarsSchema.validate(process.env);

if (error) {
  throw error;
}

const config = {
  baseUrl: envVars.BASE_URL,
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
  stagingAccess: {
    apiToken: envVars.CF_ACCESS_API_TOKEN as string | undefined,
    accountId: envVars.CF_ACCOUNT_ID as string | undefined,
    groupId: envVars.CF_ACCESS_GROUP_ID as string | undefined,
  },
};

export {config};
