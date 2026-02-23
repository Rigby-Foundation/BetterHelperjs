# BetterHelperjs Framework

BetterHelperjs — полноценный full-stack TypeScript фреймворк со своим JSX runtime, file-based router, nested layouts, loaders и SSR от Rigby Foundation.
Базовый пакет не тянет обязательные runtime-зависимости (prod deps = 0).

## Attribution

Изначальная идея и база: [`newHelper-js`](https://github.com/MIOBOMB/newHelper-js/) от MIOBOMB.

## Root scripts

```bash
npm install
npm run check
npm run test
npm run build
npm run dev         # запускает тестовый SSR сайт из ./site
```

## CLI

Создать новый Vite + SSR проект:

```bash
npx better-helperjs create my-app
```

Опции:

- `--pm npm|pnpm|yarn|bun`
- `--no-install`
- `--force`

## Тестовый сайт

Тестовый SSR сайт теперь отдельным пакетом: `site/package.json`.

```bash
npm --prefix site install
npm --prefix site run dev
npm --prefix site run build
npm --prefix site run start
```

Где страницы:

- `site/src/layout.tsx`
- `site/src/pages/index.tsx`
- `site/src/pages/about.tsx`
- `site/src/pages/docs/[slug].tsx`
- `site/src/pages/404.tsx`

## JSX и роутер без React/Preact

- JSX runtime: `better-helperjs/jsx-runtime`, `better-helperjs/jsx-dev-runtime`, `better-helperjs/jsx`
- Hooks: `useState`, `useReducer`, `useEffect`, `useMemo`, `useCallback`, `useRef` из `better-helperjs/jsx`
- Context API: `createContext`, `useContext` из `better-helperjs/jsx`
- Router core: `better-helperjs/router`
- File-based router helpers: `better-helperjs/router/file-based`
- State helpers: `better-helperjs/core` (`createCounterRenderState`, `serializeState`, ...)

### File-based router extras

- Nested layouts: `pages/layout.tsx`, `pages/docs/layout.tsx`, ...
- Route loader: `export function loader(ctx) { ... }`, данные доступны как `ctx.data`
- Error entities: `pages/error.tsx` (global), `export const errorBoundary = ...` (route-level)
- Not Found entities: `pages/404.tsx` или `pages/not-found.tsx`
- `notFound()` helper для loader/component сценариев
- SPA links: `<Link href=\"/route\" />` из `better-helperjs/router`
- Dev SSR server (`better-helperjs/ssr/site-server`) требует `vite` в проекте приложения.

### SSR modes

- `hydrateMode: 'full'` — стандартная hydration всего приложения
- `hydrateMode: 'none'` — no-hydration SSR (чистый HTML без клиентского entry)
- `hydrateMode: 'islands'` — частичная hydration через islands (`defineIsland`, `hydrateIslands`)
- SSR streaming helpers: `renderWithRouterStream`, `createHtmlChunkStream`, `streamToNodeResponse`

## Legacy Browser Build

После `npm run build` дополнительно собирается `dist/vite/better-helper.iife.js` (target: `es2015`), чтобы подключать фреймворк в старых браузерах через обычный `<script>`.

## Legacy API (Deprecated)

Эти API сохранены для совместимости и будут удалены в `3.2.0`:

- `lang._(...)`
- `lazy._(...)`
- `link._cmd`
- `link._i`
