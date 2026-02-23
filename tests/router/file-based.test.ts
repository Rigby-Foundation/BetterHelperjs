import { describe, expect, it } from 'vitest';

import { createFileRouter, createFileRoutes, filePathToRoutePath, type FileLayoutProps } from '../../src/router/file-based.js';

describe('file-based router helpers', () => {
  it('maps file path to route path', () => {
    expect(filePathToRoutePath('./pages/index.tsx')).toBe('/');
    expect(filePathToRoutePath('./pages/docs/[slug].tsx')).toBe('/docs/:slug');
    expect(filePathToRoutePath('./pages/blog/[...all].tsx')).toBe('/blog/*');
  });

  it('builds routes with notFound handler', () => {
    const routes = createFileRoutes<{ runtime: string }>(
      {
        './pages/index.tsx': {
          default: () => 'home',
          meta: { title: 'Home' },
        },
        './pages/docs/[slug].tsx': {
          default: (ctx) => `docs:${ctx.params.slug}`,
          meta: { title: 'Docs' },
        },
        './pages/404.tsx': {
          default: () => 'nf',
          meta: { title: 'NF' },
        },
        './pages/error.tsx': {
          default: (ctx) => `error:${String((ctx.error as Error).message)}`,
          meta: { title: 'ERR' },
        },
      },
      {
        pagesRoot: './pages',
        notFoundFile: './pages/404.tsx',
        errorFile: './pages/error.tsx',
      }
    );

    expect(routes.routes.map((route) => route.path)).toEqual(['/docs/:slug', '/']);
    expect(routes.notFoundTitle).toBe('NF');
    expect(routes.notFound).toBeTypeOf('function');
    expect(routes.errorTitle).toBe('ERR');
    expect(routes.errorBoundary).toBeTypeOf('function');
  });

  it('applies nested layouts and keeps route loaders', async () => {
    const router = createFileRouter<{ runtime: string }>(
      {
        './pages/layout.tsx': {
          default: ({ children }: FileLayoutProps<{ runtime: string }>) => `root(${children as string})`,
        },
        './pages/docs/layout.tsx': {
          default: ({ children }: FileLayoutProps<{ runtime: string }>) => `docs(${children as string})`,
        },
        './pages/docs/[slug].tsx': {
          default: (ctx) => `page:${ctx.params.slug}:${(ctx.data as { fromLoader: string }).fromLoader}`,
          loader: (ctx) => ({ fromLoader: ctx.params.slug ?? 'unknown' }),
          meta: { title: 'Docs' },
          errorBoundary: (ctx) => `route-error:${String((ctx.error as Error).message)}`,
        },
        './pages/404.tsx': {
          default: () => 'nf',
          meta: { title: 'NF' },
        },
        './pages/error.tsx': {
          default: (ctx) => `global-error:${String((ctx.error as Error).message)}`,
          meta: { title: 'ERR' },
        },
      },
      {
        pagesRoot: './pages',
        notFoundFile: './pages/404.tsx',
        errorFile: './pages/error.tsx',
      }
    );

    const matched = router.resolve('/docs/intro');
    const data = await matched?.route.loader?.({
      url: new URL('http://localhost/docs/intro'),
      pathname: '/docs/intro',
      searchParams: new URLSearchParams(),
      params: matched?.params ?? {},
      state: { runtime: 'node' },
      data: undefined,
    });

    const rendered = router.render('/docs/intro', { runtime: 'node' }, { data });
    expect(rendered.node).toBe('root(docs(page:intro:intro))');

    const errored = router.render('/docs/intro', { runtime: 'node' }, { error: new Error('boom') });
    expect(errored.status).toBe(500);
    expect(errored.node).toBe('root(docs(route-error:boom))');
  });
});
