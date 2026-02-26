# BetterHelper Test Site

A separate package for the SSR test site based on `better-helperjs`.

## Commands

```bash
npm install
npm run dev
npm run build
npm run start
```

## Pages (file-based)

- `src/pages/index.tsx` -> `/`
- `src/pages/about.tsx` -> `/about`
- `src/pages/docs/[slug].tsx` -> `/docs/:slug`
- `src/pages/404.tsx` -> fallback `404`
- `src/pages/error.tsx` -> global error boundary entity
- `src/pages/layout.tsx` -> root nested layout for all pages
- `src/pages/docs/layout.tsx` -> nested layout for `/docs/*`

## Loaders + data

In a page module, you can export:

```ts
export function loader(ctx) {
  return { ... };
}
```

Loader data is available in the page component via `ctx.data`.

## SPA Link

For internal navigation, use `Link`:

```tsx
import { Link } from 'better-helperjs/router';
```

## What remains in the application

- `src/layout.tsx` — application-level layout (shell)
- `src/app.tsx` — thin bootstrap: `pages` + `layout` -> `defineCounterSite(...)`
- `src/pages/*` — the pages themselves

`entry-client.ts`, `entry-server.ts`, `router.ts`, `state.ts`, `types.ts` are fully moved to the framework (`better-helperjs/ssr`, `better-helperjs/router/file-based`, `better-helperjs/core`).

## SSR hydration modes

In `defineCounterSite(...)`, you can switch between:

- `hydrateMode: 'full'` (default)
- `hydrateMode: 'none'` (no-hydration SSR)
- `hydrateMode: 'islands'` + `defineIsland(...)`
