/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['dotenv-expand/config', '<rootDir>/__tests__/utils/env.ts'],
  setupFilesAfterEnv: ['jest-extended/all'],
  testPathIgnorePatterns: ['__tests__/utils', '<rootDir>/.claude/worktrees/'],
  // Agents' worktrees are whole copies of the repo (package.json included).
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
  testTimeout: 10000,
};
