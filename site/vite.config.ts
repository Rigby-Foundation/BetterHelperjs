import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^better-helperjs\/core$/, replacement: resolve(__dirname, '../src/core/index.ts') },
      { find: /^better-helperjs\/ssr$/, replacement: resolve(__dirname, '../src/ssr/index.ts') },
      { find: /^better-helperjs\/router\/file-based$/, replacement: resolve(__dirname, '../src/router/file-based.ts') },
      { find: /^better-helperjs\/router$/, replacement: resolve(__dirname, '../src/router/index.ts') },
      { find: /^better-helperjs\/jsx$/, replacement: resolve(__dirname, '../src/jsx/index.ts') },
      { find: /^better-helperjs\/jsx-runtime$/, replacement: resolve(__dirname, '../src/jsx/jsx-runtime.ts') },
      { find: /^better-helperjs\/jsx-dev-runtime$/, replacement: resolve(__dirname, '../src/jsx/jsx-dev-runtime.ts') },
      { find: /^better-helperjs$/, replacement: resolve(__dirname, '../src/index.ts') }
    ]
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'better-helperjs'
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
    manifest: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/app.tsx')
    }
  }
});
