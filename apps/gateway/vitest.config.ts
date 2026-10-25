import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // The database tests share one test database, so test files run one at a time.
    fileParallelism: false,
  },
})
