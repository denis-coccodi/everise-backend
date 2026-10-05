// Test defaults for settings that .env and CI don't need to provide.
process.env.DUTIES_REFRESH_KEY ??= 'test-refresh-key';
process.env.ADMIN_EMAILS ??= 'admin@example.com';
