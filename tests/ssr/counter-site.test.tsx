import { describe, expect, it } from 'vitest';

import { createCounterSite, type CounterSiteRouteContext } from '../../src/ssr/counter-site.js';

describe('counter-site loaders', () => {
  it('loads route data before server render', async () => {
    const site = createCounterSite({
      pages: {
        './pages/[slug].tsx': {
          meta: { title: 'Slug' },
          loader: (ctx: CounterSiteRouteContext) => ({
            slug: ctx.params.slug,
            from: 'loader',
          }),
          default: (ctx: CounterSiteRouteContext) => {
            const data = ctx.data as { slug?: string; from?: string } | undefined;
            return <p>{data?.from}:{data?.slug}</p>;
          },
        },
        './pages/404.tsx': {
          meta: { title: '404' },
          default: () => <p>nf</p>,
        },
      },
      shell: ({ children }) => <main>{children}</main>,
      pagesRoot: './pages',
      notFoundFile: './pages/404.tsx',
      titlePrefix: 'Test',
      defaultTitle: 'Untitled',
    });

    const rendered = await site.render('/intro');

    expect(rendered.status).toBe(200);
    expect(rendered.title).toBe('Test - Slug');
    expect(rendered.html).toContain('loader:intro');
  });
});
