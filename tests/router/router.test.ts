import { describe, expect, it } from 'vitest';

import { createRouter, notFound } from '../../src/router/index.js';

describe('router', () => {
  const router = createRouter<{ runtime: string }>([
    {
      path: '/',
      title: 'home',
      component: () => 'home',
    },
    {
      path: '/docs/:slug',
      title: 'docs',
      component: (ctx) => `docs:${ctx.params.slug}`,
    },
  ], {
    notFound: (ctx) => `404:${ctx.pathname}`,
    notFoundTitle: '404',
  });

  it('matches route params', () => {
    const match = router.resolve('/docs/intro');

    expect(match).not.toBeNull();
    expect(match?.params.slug).toBe('intro');
    expect(match?.route.title).toBe('docs');
  });

  it('renders 404 result for missing route', () => {
    const rendered = router.render('/missing', { runtime: 'node' });

    expect(rendered.status).toBe(404);
    expect(rendered.title).toBe('404');
    expect(rendered.node).toBe('404:/missing');
  });

  it('builds path with params and query', () => {
    const url = router.build('/docs/:slug', { slug: 'getting-started' }, { tab: 'api', draft: false });

    expect(url).toBe('/docs/getting-started?tab=api&draft=false');
  });

  it('renders route/global error boundaries', () => {
    const errorRouter = createRouter<{ runtime: string }>(
      [
        {
          path: '/broken',
          title: 'Broken',
          component: () => {
            throw new Error('boom');
          },
          errorBoundary: (ctx) => `route-error:${String((ctx.error as Error).message)}`,
        },
      ],
      {
        notFound: () => 'nf',
        errorBoundary: (ctx) => `global-error:${String((ctx.error as Error).message)}`,
      }
    );

    const routeError = errorRouter.render('/broken', { runtime: 'node' });
    expect(routeError.status).toBe(500);
    expect(routeError.node).toBe('route-error:boom');

    const globalRouter = createRouter<{ runtime: string }>([
      {
        path: '/broken',
        title: 'Broken',
        component: () => {
          throw new Error('crash');
        },
      },
    ], {
      notFound: () => 'nf',
      errorBoundary: (ctx) => `global-error:${String((ctx.error as Error).message)}`,
    });

    const globalError = globalRouter.render('/broken', { runtime: 'node' });
    expect(globalError.status).toBe(500);
    expect(globalError.node).toBe('global-error:crash');
  });

  it('maps notFound() to 404 entity', () => {
    const local = createRouter<{ runtime: string }>([
      {
        path: '/x',
        title: 'X',
        component: () => {
          notFound();
        },
      },
    ], {
      notFound: (ctx) => `nf:${ctx.pathname}`,
      notFoundTitle: '404',
    });

    const rendered = local.render('/x', { runtime: 'node' });
    expect(rendered.status).toBe(404);
    expect(rendered.title).toBe('404');
    expect(rendered.node).toBe('nf:/x');
  });
});
