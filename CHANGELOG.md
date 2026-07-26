# Changelog

All notable changes to Karui are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and Karui adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.1] — 2026-07-26

### Fixed

- Added `"./package.json"` to the exports map. Build tooling routinely reads a
  dependency's version, and there was no way to: the subpath was not exported,
  and the package is ESM-only so `require.resolve` could not reach the entry
  either. The target is a plain string, so it resolves under every condition.

## [5.0.0] — 2026-07-26

The rendering core was rebuilt and the framework grew the server half it was
missing. Most apps upgrade by renaming a few imports; see **Migrating** below.

### Added

- **Keyed reconciler.** Updates now diff against the live DOM instead of
  replacing it. Element identity, focus, text selection, scroll offsets and
  uncontrolled input values survive a re-render.
- **`hydrate(root, node)`.** Adopts server-rendered markup rather than
  rebuilding it, including splitting parser-merged text runs back apart.
  Islands hydrate this way too, so static markup around them is untouched.
- **`unmount(root)`.** Runs effect cleanups, releases refs, empties the root.
- **`key` is honoured.** It drives both child reconciliation and hook identity,
  so a reordered list item moves its DOM node and keeps its own `useState`.
  Duplicate keys get separate hook stores instead of silently sharing one.
- **`ref` prop.** Attach a `useRef` (or a callback) to a DOM node; set on mount,
  reset to `null` on removal.
- **Route actions.** `export function action(ctx)` runs on POST/PUT/PATCH/
  DELETE, then loaders re-run and the page renders with `ctx.actionData`. A
  plain `<form method="post">` works with no client JavaScript.
- **`redirect(location, status?)`.** Throws a `RedirectError` the way
  `notFound()` throws `NotFoundError`. The server emits `Location`; the client
  navigates.
- **Page metadata.** `meta` now drives description, canonical, robots, Open
  Graph, Twitter cards, arbitrary `<meta>`/`<link>` tags and `<html lang>`, not
  just `<title>`. Export a function to derive it from loader data.
- **Static export.** `karui prerender` writes plain `.html` files. Static routes
  are discovered automatically; dynamic routes opt in with `staticPaths()`.
  Also available as `prerenderSite()` from `@rigbyhost/karui/ssr/prerender`.
- **User-defined site state.** `createSite<State>` takes an optional
  `createState`, so apps carry their own data instead of a hardcoded shape.
- **`sideEffects` metadata**, so bundlers can drop unused Karui code.
- **Bundle budgets.** `npm run build:size` reports per-entry gzip/brotli cost
  and fails the build on regression.

### Changed

- **Loader data is serialized into the page** (`__KARUI_DATA__`, configurable
  via `dataKey`). The first client render reuses the server's data instead of
  refetching, so the hydrated tree matches the markup it is adopting.
- The `ssr` barrel no longer re-exports `prerender` or `site-server`; both
  import Node built-ins and belong on their own subpaths.
- `RouteRenderResult` gained a required `meta` field, and `Router` gained
  `runAction`. Breaking only if you implemented these interfaces yourself.
- The site server accepts POST/PUT/PATCH/DELETE (previously a hard 405) and
  rejects bodies over 1 MB with 413.

### Removed

- The BetterHelper demo app that shipped inside the package
  (`src/ssr/app.tsx`, `view.ts`, `entry-client.ts`, `entry-server.ts`) and the
  demo API server (`src/server/`, with its hardcoded `/api/echo`). None were
  reachable from the export map. The `dev:api`, `dev:api-full` and `start:api`
  scripts went with them.

### Fixed

- `tsconfig.json` and `vitest.config.ts` still set `jsxImportSource` to
  `better-helperjs`, so `dist/ssr/app.js` shipped an import of a package that
  was not a dependency.
- README quoted 34.8 kB / 12.5 kB from Bundlephobia; the real figures are now
  measured on every build.
- `onDoubleClick` now binds `dblclick` rather than a non-existent
  `doubleclick` event.

## Migrating

### Renamed exports

The old API was named after the counter demo it was extracted from. Old names
still work and are marked `@deprecated`; they are removed in 6.0.

| Before | Now |
|---|---|
| `defineCounterSite` | `defineSite` |
| `createCounterSite` | `createSite` |
| `createCounterLayoutSite` | `createLayoutSite` |
| `CounterSiteConfig` | `SiteConfig<State>` |
| `CounterSite` | `Site<State>` |
| `CounterSiteRenderResult` | `SiteRenderResult<State>` |
| `CounterSiteHydrationMode` | `HydrationMode` |
| `CounterSiteRouteContext` | `SiteRouteContext<State>` |
| `CounterSiteActionContext` | `SiteActionContext<State>` |
| `CounterSiteErrorContext` | `SiteErrorContext<State>` |
| `CounterSiteLayoutProps` | `SiteLayoutProps<State>` |
| `CounterRenderState` | `RenderState` |
| `createCounterRenderState` | `createRenderState` |
| `BaseRenderState` | `RenderState` |

`RenderState` no longer carries `count` — that was demo residue. Keep a counter
in component state (`useState`) or add your own field via `createState`.

### The legacy toolkit moved

The inherited `newHelper-js` surface is no longer on the main entry, which is
now side-effect free. Update imports:

```diff
-import { helper, WindowManager } from '@rigbyhost/karui'
+import { helper, WindowManager } from '@rigbyhost/karui/legacy'
```

Affected: `helper`, `_`, `createHelper`, `mountGlobal`, `WindowManager`,
`Hotkeys`, `LazyLoader`, `LinkManager`, `LanguageService`, `HttpClient`,
`NamespaceStorage`, `ErrorCenter`, and the `dom`/`html` helpers.

This cut the main entry from 18.1 kB to 12.6 kB gzipped.

### Renamed internals

Rebuild server and client together — a half-deployed pair will not hydrate.

| Before | Now |
|---|---|
| `data-bh-island` / `data-bh-island-key` | `data-karui-island` / `data-karui-island-key` |
| `__BH_ISLANDS__` | `__KARUI_ISLANDS__` |
| `Symbol.for('betterhelper.fragment')` | `Symbol.for('karui.fragment')` |

`islandsKey` is still configurable if you need the old value during a rollout.

## [4.0.1] and earlier

Not documented — this changelog starts at 5.0.0.
