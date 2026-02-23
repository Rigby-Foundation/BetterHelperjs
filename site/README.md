# BetterHelper Test Site

Отдельный пакет для SSR тестового сайта на основе `better-helperjs`.

## Команды

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
- `src/pages/layout.tsx` -> root nested layout for all pages
- `src/pages/docs/layout.tsx` -> nested layout for `/docs/*`

## Loaders + data

В page-модуле можно экспортировать:

```ts
export function loader(ctx) {
  return { ... };
}
```

Данные loader доступны в компоненте страницы через `ctx.data`.

## SPA Link

Для внутренних переходов используйте `Link`:

```tsx
import { Link } from 'better-helperjs/router';
```

## Что осталось в приложении

- `src/layout.tsx` — layout (shell) уровня приложения
- `src/app.tsx` — тонкий bootstrap: `pages` + `layout` -> `defineCounterSite(...)`
- `src/pages/*` — сами страницы

`entry-client.ts`, `entry-server.ts`, `router.ts`, `state.ts`, `types.ts` полностью вынесены в framework (`better-helperjs/ssr`, `better-helperjs/router/file-based`, `better-helperjs/core`).
