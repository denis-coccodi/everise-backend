// gts's shared rules (ESLint flat config), plus this repo's own.
module.exports = [
  {
    ignores: [
      'build/',
      '.wrangler/',
      'public/',
      'worker-configuration.d.ts',
      // Worktrees Claude agents work in, each a whole copy of the repo.
      '.claude/worktrees/',
    ],
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
];
