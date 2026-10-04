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
};

export {config};
