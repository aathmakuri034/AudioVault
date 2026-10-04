// Global test setup. Only modules that every suite needs are mocked here;
// suites mock anything else themselves so each test states what it fakes.
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
}));
