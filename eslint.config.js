// gts's shared rules (ESLint flat config), plus this repo's own.
module.exports = [
  {
    ignores: ['build/', '.wrangler/', 'public/', 'worker-configuration.d.ts'],
  },
  ...require('gts'),
  {
    // Jest reads its config as CommonJS.
    files: ['jest.config.js'],
    languageOptions: {sourceType: 'commonjs', globals: {module: 'writable'}},
  },
  {
    files: ['**/*.ts'],
    rules: {'@typescript-eslint/no-explicit-any': 'error'},
  },
  {
    files: ['__tests__/**/*.ts'],
    rules: {'@typescript-eslint/no-explicit-any': 'off'},
  },
  {
    // Settings come from `config`, checked once by its schema (backend-best-practices skill).
    files: ['src/**/*.ts'],
    ignores: ['src/config.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read settings from `config` (src/config.ts), which checks them once; a new setting goes in its schema.',
        },
      ],
    },
  },
];
