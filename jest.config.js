/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['dotenv-expand/config', '<rootDir>/__tests__/utils/env.ts'],
  setupFilesAfterEnv: ['jest-extended/all'],
  testPathIgnorePatterns: ['__tests__/utils'],
  testTimeout: 10000,
};
