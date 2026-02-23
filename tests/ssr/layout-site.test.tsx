import { describe, expect, it } from 'vitest';

import { createCounterLayoutSite, type CounterSiteLayoutProps } from '../../src/ssr/layout-site.js';
import type { CounterSiteState, FileRouteModule } from '../../src/ssr/counter-site.js';

function Layout({ title, status, children }: CounterSiteLayoutProps) {
  return (
    <main>
      <h1>Layout: {title}</h1>
      <p>Status: {status}</p>
      <section>{children}</section>
    </main>
  );
}

const pages: Record<string, FileRouteModule<CounterSiteState>> = {
  './pages/index.tsx': {
    meta: { title: 'Home' },
    default: () => <p>Home page</p>,
  },
  './pages/about.tsx': {
    meta: { title: 'About' },
    default: () => <p>About page</p>,
  },
  './pages/404.tsx': {
    meta: { title: '404' },
    default: (ctx) => <p>Missing: {ctx.pathname}</p>,
  },
};

describe('ssr layout-site', () => {
  it('renders page content through shared layout', async () => {
    const site = createCounterLayoutSite({
      pages,
      layout: Layout,
      titlePrefix: 'Test Site',
      pagesRoot: './pages',
      notFoundFile: './pages/404.tsx',
      autoHydrate: false,
    });

    const result = await site.render('/about');

    expect(result.status).toBe(200);
    expect(result.title).toBe('Test Site - About');
    expect(result.html).toContain('Layout: About');
    expect(result.html).toContain('About page');
  });

  it('renders 404 through shared layout', async () => {
    const site = createCounterLayoutSite({
      pages,
      layout: Layout,
      titlePrefix: 'Test Site',
      pagesRoot: './pages',
      notFoundFile: './pages/404.tsx',
      autoHydrate: false,
    });

    const result = await site.render('/missing');

    expect(result.status).toBe(404);
    expect(result.title).toBe('Test Site - 404');
    expect(result.html).toContain('Layout: 404');
    expect(result.html).toContain('Missing: /missing');
  });
});
