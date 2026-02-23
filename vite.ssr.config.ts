import { resolve } from 'node:path';
import { defineConfig } from 'vite';

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
  build: {
    outDir: 'dist/ssr/client',
    emptyOutDir: true,
    manifest: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/ssr/entry-client.ts'),
    },
  },
});
