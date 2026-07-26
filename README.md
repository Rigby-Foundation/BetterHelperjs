# Karui

**Zero dependencies. 7.6 kB gzipped. Islands, SSR, and file-based routing — out of the box.**

Karui is a full-stack TypeScript framework with its own JSX runtime. No React. No Preact. No mandatory runtime dependencies. Just fast, lightweight, production-ready apps.

```bash
npx @rigbyhost/karui create my-app
cd my-app
bun dev
```

---

## Why Karui?

Most frameworks ask you to assemble a puzzle:

| What you need | React ecosystem | Karui |
|---|---|---|
| UI runtime | `react` + `react-dom` (~130 kB) | built-in |
| Routing | `react-router` (~30 kB) | built-in |
| i18n | `react-i18next` (~20 kB) | built-in |
| SSR | Next.js (~100 kB+) | built-in |
| State | Redux / Zustand / Jotai | built-in |
| **Total** | **300 kB+** | **7.6 kB gzipped** |

Karui ships everything you need in a single package. No plugin hunting. No compatibility issues. No version hell.

---

## Features

- **Own JSX runtime** — full React-compatible API (`useState`, `useEffect`, `useReducer`, `useMemo`, `useCallback`, `useRef`, `createContext`, `useContext`) without React
- **File-based routing** — drop a file in `pages/`, get a route
- **Nested layouts** — `pages/layout.tsx`, `pages/docs/layout.tsx`, infinitely nestable
- **Keyed reconciler** — updates diff against the live DOM, so focus, selection, scroll and uncontrolled input values survive a re-render
- **Real hydration** — `hydrate()` adopts server markup instead of rebuilding it
- **Route loaders** — `export function loader(ctx)` for server-side data fetching
- **Route actions** — `export function action(ctx)` for mutations; a plain `<form method="post">` works with zero client JS
- **`redirect()` and `notFound()`** — control flow from any loader or action
- **Page metadata** — `export const meta` drives `<title>`, description, canonical, Open Graph, Twitter cards, `<html lang>`
- **Static export** — `karui prerender` writes plain `.html` files
- **Islands architecture** — `defineIsland` + `hydrateIslands` for partial hydration
- **Three hydration modes** — `full`, `none` (pure HTML), `islands`
- **Error boundaries** — global `pages/error.tsx` and per-route `export const errorBoundary`
- **SPA navigation** — `<Link href="/route" />` with no full-page reloads
- **Legacy browser build** — IIFE bundle targeting ES2015 for `<script>` tag usage
- **Zero prod dependencies** — nothing sneaks into your `node_modules` at runtime

---

## Getting Started

```bash
npx @rigbyhost/karui create my-app
cd my-app
bun dev       # or npm run dev / pnpm dev
```

CLI options:

```bash
npx @rigbyhost/karui create my-app --pm bun
npx @rigbyhost/karui create my-app --no-install
npx @rigbyhost/karui create my-app --force
```

---

## Project Structure

```
my-app/
├── src/
│   ├── pages/
│   │   ├── layout.tsx          # root layout
│   │   ├── index.tsx           # → /
│   │   ├── about.tsx           # → /about
│   │   ├── 404.tsx             # not found page
│   │   └── docs/
│   │       ├── layout.tsx      # nested layout for /docs/*
│   │       └── [slug].tsx      # → /docs/:slug
│   └── entry.tsx
├── package.json
└── vite.config.ts
```

---

## Routing

### Basic page

```tsx
// src/pages/about.tsx
export default function About() {
  return <h1>About</h1>
}
```

### Dynamic route

```tsx
// src/pages/docs/[slug].tsx
export default function Doc({ params }: { params: { slug: string } }) {
  return <h1>Doc: {params.slug}</h1>
}
```

### Route loader

```tsx
export async function loader(ctx) {
  const data = await fetchSomething(ctx.params.slug)
  return data
}

export default function Page({ data }) {
  return <pre>{JSON.stringify(data, null, 2)}</pre>
}
```

### Not found

```tsx
import { notFound } from '@rigbyhost/karui/router'

export async function loader(ctx) {
  const post = await getPost(ctx.params.slug)
  if (!post) notFound()
  return post
}
```

### Redirect

```tsx
import { redirect } from '@rigbyhost/karui/router'

export async function loader(ctx) {
  if (!ctx.state.user) redirect('/login')
  return getDashboard()
}
```

The server sends a `Location` header; client-side navigation follows it in place.

---

## Mutations

Export an `action` next to your `loader`. It runs on `POST`, `PUT`, `PATCH` and
`DELETE`, before the page re-renders — so a plain HTML form works with no
client JavaScript at all.

```tsx
// src/pages/contact.tsx
import { redirect } from '@rigbyhost/karui/router'

export async function action(ctx) {
  const message = String(ctx.request.formData.message ?? '').trim()
  if (!message) return { error: 'Message cannot be empty' }

  await saveMessage(message)
  redirect('/contact?sent=1', 303)   // POST/redirect/GET: reload is safe
}

export default function Contact(ctx) {
  const result = ctx.actionData          // whatever the action returned
  return (
    <form method="post">
      {result?.error ? <p>{result.error}</p> : null}
      <input name="message" />
      <button type="submit">Send</button>
    </form>
  )
}
```

`ctx.request` carries `method`, lowercased `headers`, the raw `body`, parsed
`formData` (repeated fields become arrays), and `json` when the Content-Type is
JSON. `multipart/form-data` is not parsed — read `body` yourself for uploads.

A `POST` to a route with no `action` answers `405`. Bodies above 1 MB get `413`.

---

## Page Metadata

`meta` fills in `<head>`. Every field is optional.

```tsx
export const meta = {
  title: 'Docs',
  description: 'How Karui routing works',
  canonical: 'https://example.com/docs',
  robots: 'index,follow',
  lang: 'en',
  og: { type: 'article', image: 'https://example.com/card.png' },
  twitter: { card: 'summary_large_image' },
  meta: [{ name: 'author', content: 'Rigby Foundation' }],
  link: [{ rel: 'alternate', hreflang: 'de', href: '/de/docs' }],
}
```

`og:title`, `og:description` and `og:url` default to your title, description
and canonical, so most pages only set the three fields they care about.

Export a function instead to build metadata from loader data:

```tsx
export const meta = (ctx) => ({
  title: `Post: ${ctx.data.title}`,
  description: ctx.data.excerpt,
})
```

Omit `title` and Karui falls back to one derived from the route path.

---

## Static Export

Render the whole site to plain `.html` files — no Node process needed to serve
it. Pairs naturally with `hydrateMode: 'none'` for pages that ship zero JS.

```bash
npm run build          # client + server bundles
karui prerender        # → dist/static/
```

Static routes are discovered automatically. For dynamic routes, export
`staticPaths`:

```tsx
// src/pages/docs/[slug].tsx
export function staticPaths() {
  return [{ slug: 'intro' }, { slug: 'routing' }]
}
```

A dynamic route without `staticPaths` is skipped rather than silently missed.

```bash
karui prerender --out public --not-found /404 --path /extra-page
```

Or call it from a script:

```ts
import { prerenderSite } from '@rigbyhost/karui/ssr/prerender'

await prerenderSite({ outDir: 'dist/static', notFoundPath: '/404' })
```

---

## JSX Runtime

Configure in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rigbyhost/karui"
  }
}
```

Import hooks directly:

```tsx
import { useState, useEffect, useRef } from '@rigbyhost/karui/jsx'

export default function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

### Rendering

| | |
|---|---|
| `mount(root, node)` | render into `root`; later calls diff against the live DOM |
| `hydrate(root, node)` | adopt server markup already in `root`, then behave like `mount` |
| `unmount(root)` | run effect cleanups, release refs, empty `root` |
| `renderToString(node)` | HTML string, for SSR |
| `renderToDom(node, doc)` | detached DOM nodes |

Updates patch in place, so an element keeps its identity across renders — focus,
text selection, scroll offsets and uncontrolled input values are preserved.

### Keys

`key` drives reconciliation *and* hook identity. A keyed list item keeps its own
`useState` across reorders, and its DOM node is moved rather than rebuilt:

```tsx
{items.map(item => <Row key={item.id} item={item} />)}
```

### Refs

Attach a `useRef` to a DOM node with the `ref` prop. It is set on mount and
reset to `null` when the element leaves the tree:

```tsx
const input = useRef(null)
useEffect(() => input.current?.focus(), [])
return <input ref={input} />
```

---

## SSR Modes

Hydration mode is configured in `src/app.tsx` via `defineSite`:

### Full hydration (default)

```ts
// src/app.tsx
export const site = defineSite({
  pages,
  layout: Layout,
  hydrateMode: 'full',
})
```

### No hydration — pure HTML, zero client JS

```ts
// src/app.tsx
export const site = defineSite({
  pages,
  layout: Layout,
  hydrateMode: 'none',
})
```

### Islands — hydrate only what needs interactivity

```tsx
// src/app.tsx
export const site = defineSite({
  pages,
  layout: Layout,
  hydrateMode: 'islands',
})
```

```tsx
// src/components/Counter.tsx
import { defineIsland } from '@rigbyhost/karui/ssr'
import { useState } from '@rigbyhost/karui/jsx'

export const Counter = defineIsland(() => {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>{n}</button>
})
```

```tsx
// In your page — only Counter ships JS to the client
import { hydrateIslands } from '@rigbyhost/karui/ssr'
import { Counter } from '../components/Counter'

export default function Page() {
  return (
    <div>
      <p>This is pure HTML — no JS sent to client</p>
      <Counter />  {/* only this is hydrated */}
    </div>
  )
}
```

---

## Chunked Responses

```ts
import { renderWithRouterStream, streamToNodeResponse } from '@rigbyhost/karui/ssr'

// In your Node.js server handler:
const stream = await renderWithRouterStream(request, router)
streamToNodeResponse(stream, response)
```

Note: this chunks an already-complete HTML string over the wire. It is not
progressive streaming — the whole page renders before the first byte is sent,
so there is no time-to-first-byte benefit yet.

---

## Bundle Size

Measured on every build by `scripts/bundle-size.mjs`, which fails CI if an entry
exceeds its budget. Run `npm run build:size` yourself.

| Entry | Minified | Gzipped | Brotli |
|---|---|---|---|
| `@rigbyhost/karui/jsx` — runtime, hooks, reconciler | 16.8 kB | 5.1 kB | 4.5 kB |
| `@rigbyhost/karui/router` — router + `Link` | 7.9 kB | 2.9 kB | 2.5 kB |
| **jsx + router — typical client app** | **24.8 kB** | **7.6 kB** | **6.8 kB** |
| `@rigbyhost/karui/ssr` — SSR, islands | 37.3 kB | 11.1 kB | 9.9 kB |
| `@rigbyhost/karui` — jsx + router + ssr | 42.5 kB | 12.6 kB | 11.3 kB |
| `@rigbyhost/karui/legacy` — inherited toolkit | 20.0 kB | 6.4 kB | 5.6 kB |

The main entry has no side effects and `package.json` declares `sideEffects`,
so a bundler keeps only what you import.

---

## Contributing

```bash
git clone https://github.com/Rigby-Foundation/Karui
cd Karui
npm install
npm --prefix site ci

npm run check     # tsc --noEmit
npm run test      # vitest
npm run build     # tsc + vite + bundle budgets
npm run dev       # serve ./site against your working copy
```

Test site pages live in `site/src/pages/`. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for layout, ground rules and release
steps.

---

## Security

Security vulnerabilities should be reported via [GitHub Security Advisories](https://github.com/Rigby-Foundation/Karui/security/advisories/new). Please do not open public issues for security bugs.

---

## Legacy Toolkit

Karui inherited an imperative, pre-JSX toolkit from
[`newHelper-js`](https://github.com/MIOBOMB/newHelper-js/): DOM helpers,
draggable windows, hotkeys, a script lazy-loader, a query-string router, a
`data-trans` i18n service, and a string-returning HTTP client.

It still works, but it lives on its own entry so the main one stays
side-effect free:

```ts
import { helper, WindowManager, Hotkeys } from '@rigbyhost/karui/legacy'
```

Importing it instantiates `helper` and registers a `popstate` listener. New
code should prefer the JSX runtime, the router, and `fetch`.

---

## Upgrading

See [CHANGELOG.md](./CHANGELOG.md) for the full 5.0 migration guide: renamed
site exports (`defineCounterSite` → `defineSite`, with deprecated aliases kept
until 6.0), the legacy split above, and the renamed island wire format.

---

## License

[LGPL-3.0](./LICENSE)

---

## Attribution

Original idea and architecture: [`newHelper-js`](https://github.com/MIOBOMB/newHelper-js/) by MIOBOMB.