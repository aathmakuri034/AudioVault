// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // jest.mock factories must require() lazily; asset modules are required by path.
    files: ['**/__tests__/**', 'src/test-utils/**', 'src/features/library/sampleLibrary.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
