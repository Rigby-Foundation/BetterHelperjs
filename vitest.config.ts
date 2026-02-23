import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'better-helperjs/jsx-runtime': resolve(__dirname, 'src/jsx/jsx-runtime.ts'),
      'better-helperjs/jsx-dev-runtime': resolve(__dirname, 'src/jsx/jsx-dev-runtime.ts'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'better-helperjs',
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    clearMocks: true,
  },
});
