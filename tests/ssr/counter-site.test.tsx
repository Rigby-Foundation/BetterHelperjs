import { describe, expect, it } from 'vitest';

import { notFound } from '../../src/router/index.js';
import { createCounterSite, type CounterSiteRouteContext } from '../../src/ssr/counter-site.js';
import { defineIsland } from '../../src/ssr/islands.js';

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

  it('renders notFound entity when loader throws notFound()', async () => {
    const site = createCounterSite({
      pages: {
        './pages/[slug].tsx': {
          meta: { title: 'Slug' },
          loader: () => {
            notFound();
          },
          default: () => <p>ok</p>,
        },
        './pages/404.tsx': {
          meta: { title: 'Not Found' },
          default: (ctx: CounterSiteRouteContext) => <p>nf:{ctx.pathname}</p>,
        },
      },
      shell: ({ children }) => <main>{children}</main>,
      pagesRoot: './pages',
      notFoundFile: './pages/404.tsx',
      defaultTitle: 'Untitled',
    });

    const rendered = await site.render('/intro');
    expect(rendered.status).toBe(404);
    expect(rendered.html).toContain('nf:/intro');
  });

  it('renders error entity when loader throws regular error', async () => {
    const site = createCounterSite({
      pages: {
        './pages/[slug].tsx': {
          meta: { title: 'Slug' },
          loader: () => {
            throw new Error('loader-crash');
          },
          default: () => <p>ok</p>,
        },
        './pages/error.tsx': {
          meta: { title: 'Error' },
          default: (ctx) => <p>error:{String((ctx.error as Error).message)}</p>,
        },
        './pages/404.tsx': {
          meta: { title: 'Not Found' },
          default: () => <p>nf</p>,
        },
      },
      shell: ({ children }) => <main>{children}</main>,
      pagesRoot: './pages',
      notFoundFile: './pages/404.tsx',
      errorFile: './pages/error.tsx',
      defaultTitle: 'Untitled',
    });

    const rendered = await site.render('/intro');
    expect(rendered.status).toBe(500);
    expect(rendered.html).toContain('error:loader-crash');
  });

  it('supports no-hydration and islands render modes', async () => {
    const CounterIsland = defineIsland(
      ({ value }: { value: number }) => <button>counter:{value}</button>,
      { key: 'counter-island' }
    );

    const noHydrationSite = createCounterSite({
      pages: {
        './pages/index.tsx': {
          meta: { title: 'Home' },
          default: () => <p>plain</p>,
        },
        './pages/404.tsx': {
          default: () => <p>nf</p>,
        },
      },
      shell: ({ children }) => <main>{children}</main>,
      pagesRoot: './pages',
      hydrateMode: 'none',
    });

    const noHydration = await noHydrationSite.render('/');
    expect(noHydration.hydrationMode).toBe('none');
    expect(noHydration.statePayload).toBe('null');

    const islandsSite = createCounterSite({
      pages: {
        './pages/index.tsx': {
          meta: { title: 'Home' },
          default: () => (
            <section>
              <CounterIsland value={2} />
            </section>
          ),
        },
        './pages/404.tsx': {
          default: () => <p>nf</p>,
        },
      },
      shell: ({ children }) => <main>{children}</main>,
      pagesRoot: './pages',
      hydrateMode: 'islands',
      islandsKey: '__TEST_ISLANDS__',
    });

    const islands = await islandsSite.render('/');
    expect(islands.hydrationMode).toBe('islands');
    expect(islands.statePayload).toBe('null');
    expect(islands.islandsPayload.length).toBe(1);
    expect(islands.islandsPayloadJson).toContain('"counter-island"');
    expect(islands.html).toContain('data-bh-island="0"');
  });
});
