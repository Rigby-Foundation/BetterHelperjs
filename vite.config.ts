import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const jsxRuntimeAlias = {
  'better-helperjs/jsx-runtime': resolve(__dirname, 'src/jsx/jsx-runtime.ts'),
  'better-helperjs/jsx-dev-runtime': resolve(__dirname, 'src/jsx/jsx-dev-runtime.ts'),
};

export default defineConfig({
  resolve: {
    alias: jsxRuntimeAlias,
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'better-helperjs',
  },
  build: {
    target: 'es2015',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BetterHelper',
      formats: ['es', 'umd', 'iife'],
      fileName: (format) => `better-helper.${format}.js`,
    },
    outDir: 'dist/vite',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
  },
});
