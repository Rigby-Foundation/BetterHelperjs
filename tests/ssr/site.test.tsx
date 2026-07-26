import { describe, expect, it } from 'vitest';

import { notFound } from '../../src/router/index.js';
import { createRenderState, type RenderState } from '../../src/core/state.js';
import { createLayoutSite, createSite, defineSite, type SiteRouteContext } from '../../src/ssr/site.js';
import {
  createCounterLayoutSite,
  createCounterSite,
  defineCounterSite,
  type CounterSiteRouteContext,
} from '../../src/ssr/deprecated.js';
import { defineIsland } from '../../src/ssr/islands.js';

describe('site loaders', () => {
  it('loads route data before server render', async () => {
    const site = createSite({
      pages: {
        './pages/[slug].tsx': {
          meta: { title: 'Slug' },
          loader: (ctx: SiteRouteContext) => ({
            slug: ctx.params.slug,
            from: 'loader',
          }),
          default: (ctx: SiteRouteContext) => {
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
    const site = createSite({
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
          default: (ctx: SiteRouteContext) => <p>nf:{ctx.pathname}</p>,
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
    const site = createSite({
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

    const noHydrationSite = createSite({
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

    const islandsSite = createSite({
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
    expect(islands.html).toContain('data-karui-island="0"');
  });
});

describe('site head', () => {
  function metaSite(meta: unknown) {
    return createSite({
      pages: {
        './pages/[slug].tsx': {
          meta: meta as never,
          loader: (ctx: SiteRouteContext) => ({ slug: ctx.params.slug }),
          default: () => <p>page</p>,
        },
        './pages/404.tsx': { default: () => <p>nf</p> },
      },
      shell: ({ children }) => <main>{children}</main>,
      pagesRoot: './pages',
      notFoundFile: './pages/404.tsx',
      titlePrefix: 'Site',
      defaultTitle: 'Untitled',
    });
  }

  it('emits full metadata, not just a title', async () => {
    const rendered = await metaSite({
      title: 'Docs',
      description: 'How it works',
      canonical: 'https://example.com/docs',
      twitter: { card: 'summary' },
    }).render('/docs');

    // The site-wide titlePrefix belongs in <title>, as it always has.
    expect(rendered.head).toContain('<title>Site - Docs</title>');
    expect(rendered.head).toContain('<meta name="description" content="How it works">');
    expect(rendered.head).toContain('<link rel="canonical" href="https://example.com/docs">');
    expect(rendered.head).toContain('<meta name="twitter:card" content="summary">');
  });

  it('builds metadata from loader data when meta is a function', async () => {
    const rendered = await metaSite(
      (ctx: SiteRouteContext) => ({
        title: `Post ${String((ctx.data as { slug?: string }).slug)}`,
        description: `About ${String((ctx.data as { slug?: string }).slug)}`,
      })
    ).render('/hello');

    expect(rendered.head).toContain('<title>Site - Post hello</title>');
    expect(rendered.head).toContain('content="About hello"');
  });

  it('surfaces meta.lang for the html tag', async () => {
    const rendered = await metaSite({ title: 'Docs', lang: 'ja' }).render('/docs');

    expect(rendered.lang).toBe('ja');
  });

  it('falls back to the path-derived title when a page sets none', async () => {
    const rendered = await metaSite({ description: 'no title here' }).render('/docs');

    // Derived from the route pattern '/:slug', not from the requested URL.
    expect(rendered.head).toContain('<title>Site - Slug</title>');
    expect(rendered.title).toBe('Site - Slug');
  });

  it('marks the not-found page noindex', async () => {
    const rendered = await metaSite({ title: 'Docs' }).render('/nope/deep/miss');

    expect(rendered.status).toBe(404);
    expect(rendered.head).toContain('<meta name="robots" content="noindex">');
  });
});

describe('site state', () => {
  interface AppState extends RenderState {
    user: string;
  }

  it('defaults to url/runtime/generatedAt with no app fields', async () => {
    const site = createSite({
      pages: {
        './pages/index.tsx': { default: (ctx) => <p>{Object.keys(ctx.state).sort().join(',')}</p> },
        './pages/404.tsx': { default: () => <p>nf</p> },
      },
      shell: ({ children }) => <main>{children}</main>,
      pagesRoot: './pages',
    });

    const rendered = await site.render('/');
    expect(rendered.html).toContain('generatedAt,runtime,url');
  });

  it('lets an app define its own state shape', async () => {
    const site = createSite<AppState>({
      pages: {
        './pages/index.tsx': {
          default: (ctx) => <p>user:{ctx.state.user}</p>,
        },
        './pages/404.tsx': { default: () => <p>nf</p> },
      },
      shell: ({ children }) => <main>{children}</main>,
      pagesRoot: './pages',
      createState: (url, runtime) => ({ ...createRenderState(url, runtime), user: 'ada' }),
    });

    const rendered = await site.render('/');
    expect(rendered.html).toContain('user:ada');
    expect(rendered.state.user).toBe('ada');
    expect(rendered.statePayload).toContain('"user":"ada"');
  });
});

describe('layout site', () => {
  const pages = {
    './pages/index.tsx': { meta: { title: 'Home' }, default: () => <p>body</p> },
    './pages/404.tsx': { default: () => <p>nf</p> },
  };

  it('uses the layout as the shell', async () => {
    const site = createLayoutSite({
      pages,
      pagesRoot: './pages',
      titlePrefix: 'Demo',
      layout: ({ title, status, children }) => (
        <main>
          <h1>{title}</h1>
          <span>{status}</span>
          {children}
        </main>
      ),
    });

    const rendered = await site.render('/');
    expect(rendered.html).toContain('<h1>Home</h1>');
    expect(rendered.html).toContain('<span>200</span>');
    expect(rendered.html).toContain('<p>body</p>');
    expect(rendered.title).toBe('Demo - Home');
  });

  it('exposes its route table for tooling', async () => {
    const site = createLayoutSite({
      pages,
      pagesRoot: './pages',
      layout: ({ children }) => <main>{children}</main>,
    });

    expect(site.routes.map((route) => route.path)).toContain('/');
  });

  it('defineSite is the layout-site entry point', () => {
    expect(defineSite).toBe(createLayoutSite);
  });
});

describe('deprecated counter aliases', () => {
  it('still render, and still default count to 0', async () => {
    const site = createCounterSite({
      pages: {
        './pages/index.tsx': {
          default: (ctx: CounterSiteRouteContext) => <p>count:{ctx.state.count}</p>,
        },
        './pages/404.tsx': { default: () => <p>nf</p> },
      },
      shell: ({ children }) => <main>{children}</main>,
      pagesRoot: './pages',
    });

    const rendered = await site.render('/');
    expect(rendered.html).toContain('count:0');
    expect(rendered.state.count).toBe(0);
  });

  it('defineCounterSite still points at the layout entry point', () => {
    expect(defineCounterSite).toBe(createCounterLayoutSite);
  });
});
