import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests sit beside the files they cover, so the include is a sweep rather
    // than a directory.
    include: ['src/**/*.test.{ts,tsx}', 'worker/**/*.test.ts'],
    // Node everywhere by default; component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock, so the faster environment stays the
    // default for the ~80% of tests that are pure functions.
    environment: 'node',
    // @testing-library/react registers its automatic DOM cleanup through a
    // global afterEach; without globals that hook never runs and the previous
    // test's markup stays in the document, so queries match stale nodes.
    globals: true,
    // Pinned rather than inherited: React resolves its development build -- the
    // only one that exports `act`, which @testing-library/react needs -- from
    // NODE_ENV. An ambient NODE_ENV=production in the caller's shell otherwise
    // makes every component test fail with "React.act is not a function".
    env: { NODE_ENV: 'test' },
    setupFiles: ['vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}', 'worker/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        // Colocation means the tests live under src/, so they have to be
        // excluded from the measurement or they would cover themselves.
        '**/*.test.{ts,tsx}',
        // Shared test fixtures, imported only by tests.
        'src/testing/**',
        // Astro routes and layouts are markup only; they have no logic to
        // cover and cannot be imported outside an Astro build.
        'src/pages/**',
        'src/layouts/**',
      ],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
})
