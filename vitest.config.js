import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest config. Server tests run in node, frontend tests run in node too
// (no jsdom needed for pure-utility coverage). Both globs are included so
// `npm test` covers everything.
export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'src/**/__tests__/**/*.test.{ts,tsx,js}',
      'tests/**/*.test.{ts,js}'
    ],
    environment: 'node',
    testTimeout: 15_000
  }
});
