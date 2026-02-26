# BetterHelperjs Framework

BetterHelperjs is a full-stack TypeScript framework with its own JSX runtime, file-based router, nested layouts, loaders, and SSR by Rigby Foundation.
The base package has no mandatory runtime dependencies (prod deps = 0).

## Attribution

Original idea and base: [`newHelper-js`](https://github.com/MIOBOMB/newHelper-js/) by MIOBOMB.

## Root scripts

```bash
npm install
npm run check
npm run test
npm run build
npm run dev         # starts the test SSR site from ./site
```

## CLI

Create a new Vite + SSR project:

```bash
npx better-helperjs create my-app
```

Options:

- `--pm npm|pnpm|yarn|bun`
- `--no-install`
- `--force`

## Test Site

The test SSR site is now a separate package: `site/package.json`.

```bash
npm --prefix site install
npm --prefix site run dev
npm --prefix site run build
npm --prefix site run start
```

Where pages are:

- `site/src/layout.tsx`
- `site/src/pages/index.tsx`
- `site/src/pages/about.tsx`
- `site/src/pages/docs/[slug].tsx`
- `site/src/pages/404.tsx`

## JSX and router without React/Preact

- JSX runtime: `better-helperjs/jsx-runtime`, `better-helperjs/jsx-dev-runtime`, `better-helperjs/jsx`
- Hooks: `useState`, `useReducer`, `useEffect`, `useMemo`, `useCallback`, `useRef` from `better-helperjs/jsx`
- Context API: `createContext`, `useContext` from `better-helperjs/jsx`
- Router core: `better-helperjs/router`
- File-based router helpers: `better-helperjs/router/file-based`
- State helpers: `better-helperjs/core` (`createCounterRenderState`, `serializeState`, ...)

### File-based router extras

- Nested layouts: `pages/layout.tsx`, `pages/docs/layout.tsx`, ...
- Route loader: `export function loader(ctx) { ... }`, data available as `ctx.data`
- Error entities: `pages/error.tsx` (global), `export const errorBoundary = ...` (route-level)
- Not Found entities: `pages/404.tsx` or `pages/not-found.tsx`
- `notFound()` helper for loader/component scenarios
- SPA links: `<Link href=\"/route\" />` from `better-helperjs/router`
- Dev SSR server (`better-helperjs/ssr/site-server`) requires `vite` in the application project.

### SSR modes

- `hydrateMode: 'full'` — standard hydration of the entire application
- `hydrateMode: 'none'` — no-hydration SSR (pure HTML without client entry)
- `hydrateMode: 'islands'` — partial hydration via islands (`defineIsland`, `hydrateIslands`)
- SSR streaming helpers: `renderWithRouterStream`, `createHtmlChunkStream`, `streamToNodeResponse`

## Legacy Browser Build

After `npm run build`, `dist/vite/better-helper.iife.js` (target: `es2015`) is additionally built to include the framework in legacy browsers via a plain `<script>`.

## Legacy API (Deprecated)

These APIs are kept for compatibility and will be removed in `3.2.0`:

- `lang._(...)`
- `lazy._(...)`
- `link._cmd`
- `link._i`
