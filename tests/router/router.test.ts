import { describe, expect, it } from 'vitest';

import { createRouter } from '../../src/router/index.js';

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
});
