// Test defaults for settings that .env and CI don't need to provide.
process.env.DUTIES_REFRESH_KEY ??= 'test-refresh-key';
process.env.ADMIN_EMAILS ??= 'admin@example.com';
process.env.CHECK_API_RESPONSES ??= 'true';
// Every feature on, so the tests (and openapi.json) cover them all.
process.env.FEATURES ??= 'planner';
