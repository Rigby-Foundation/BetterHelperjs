# Contributing to Karui

## Setup

```bash
git clone https://github.com/Rigby-Foundation/Karui
cd Karui
npm install
npm --prefix site ci    # the test site has its own lockfile
```

## The loop

```bash
npm run check     # tsc --noEmit
npm test          # vitest
npm run build     # tsc + vite + bundle budgets
npm run dev       # serve ./site against your working copy
```

`npm run dev` runs the SSR site in `site/` with Vite aliases pointed at `src/`,
so framework edits show up on reload without a rebuild.

## Layout

| Path | What lives there |
|---|---|
| `src/jsx/` | JSX runtime, hooks, and the reconciler (`host.ts`) |
| `src/router/` | Route matching, loaders, actions, file-based routing |
| `src/ssr/` | Server render, hydration, islands, prerender, site server |
| `src/core/` | Runtime detection, render state, storage, i18n, errors |
| `src/legacy/` | Inherited `newHelper-js` toolkit, kept off the main entry |
| `src/cli/` | `karui create` scaffold templates |
| `site/` | The test site, exercised by CI |

## Ground rules

**The main entry stays side-effect free.** `src/index.ts` must not run anything
at import time. Modules that do are listed in `package.json`'s `sideEffects`;
adding to that list needs a reason.

**Do not put Node built-ins behind the `ssr` barrel.** `src/ssr/index.ts` is
loaded by client bundles. Anything importing `node:*` gets its own subpath —
that is why `prerender` and `site-server` are not re-exported there.

**Bundle budgets are enforced.** `npm run build` fails if an entry exceeds its
gzip budget in `scripts/bundle-size.mjs`. If a change legitimately grows the
bundle, raise the budget in the same commit and say why.

**SSR and the client share one render walk.** `normalize()` in
`src/jsx/index.ts` produces the host tree that HTML serialization, DOM
patching, and hydration all consume. Keep them reading the same tree — that
parity is what makes hydration reliable.

## Tests

Tests live in `tests/`, mirroring `src/`. Vitest, jsdom for DOM work
(`// @vitest-environment jsdom` at the top of the file).

Prefer asserting observable behaviour over implementation details — e.g. that
focus survives a re-render, not that some internal method was called. The
reconciler and hydration suites are the model.

Bug fixes want a regression test that fails before the fix.

## Pull requests

- Branch off `main`; CI runs typecheck, tests, and builds for both the package
  and the test site on Node 20/22/24.
- Update `CHANGELOG.md` under an `## [Unreleased]` heading.
- Public API changes need a README update.
- Breaking changes need a migration note in the changelog.

## Releasing

Publishing is triggered by pushing a version tag; the workflow typechecks,
tests, and builds before `npm publish`.

```bash
npm version <major|minor|patch>
git push --follow-tags
```

## Security

Report vulnerabilities through
[GitHub Security Advisories](https://github.com/Rigby-Foundation/Karui/security/advisories/new),
not public issues.
