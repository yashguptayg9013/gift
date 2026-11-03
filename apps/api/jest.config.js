/** @type {import('jest').Config} */
const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }] },
  testEnvironment: 'node',
};
module.exports = {
  projects: [
    { ...base, displayName: 'unit', rootDir: 'src', testRegex: '.*\\.spec\\.ts$' },
    {
      ...base,
      displayName: 'integration',
      rootDir: 'test',
      testRegex: '.*\\.int-spec\\.ts$',
      globalSetup: '<rootDir>/setup/global-setup.ts',
      setupFiles: ['<rootDir>/setup/env.ts'],
    },
  ],
  testTimeout: 60000,
};
