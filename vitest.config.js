import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global test configuration
    globals: true,

    // Setup file
    setupFiles: ['./vitest.setup.js'],

    // Include patterns
    include: ['tests/**/*.test.js'],

    // Exclude patterns
    exclude: ['tests/e2e/**', 'node_modules/**'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'pipelines/**/*.js',
        'services/**/*.js',
        'adapters/**/*.js',
      ],
      exclude: [
        'node_modules/**',
        'tests/**',
        'apps/**',
        '**/*.test.js',
      ],
      // Phase 1 coverage targets (pattern validation)
      // NOTE: Current tests validate logic patterns via recreated functions
      // Full integration tests with actual imports will increase coverage
      thresholds: {
        lines: 15,
        functions: 15,
        branches: 30,
        statements: 15,
      },
    },

    // Timeout for async tests
    testTimeout: 10000,

    // Reporter
    reporters: ['default'],

    // Pool options
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
});
