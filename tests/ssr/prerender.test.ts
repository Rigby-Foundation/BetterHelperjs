import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectPrerenderPaths, prerenderSite } from '../../src/ssr/prerender.js';

const TEMPLATE = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head><!--app-head--></head>',
  '  <body>',
  '    <div id="app"><!--app-html--></div>',
  '    <script>window.__SITE_STATE__ = <!--app-state--></script>',
  '    <!--app-bootstrap-->',
  '    <!--app-scripts-->',
  '  </body>',
  '</html>',
].join('\n');

/**
 * Stand in for a real `vite build --ssr` output: the prerenderer only needs a
 * module exporting `site.render()` plus an optional route table.
 */
const SERVER_MODULE = `
const routes = [
  { path: '/' },
  { path: '/about' },
  { path: '/docs/:slug', staticPaths: () => [{ slug: 'intro' }, { slug: 'api' }] },
  { path: '/admin/:id' },
  { path: '/go' },
];

export const site = {
  routes,
  async render(url) {
    if (url === '/go') {
      return { html: '', head: '', status: 302, redirect: { location: '/about', status: 302 } };
    }
    if (url === '/404') {
      return { html: '<p>missing</p>', head: '<title>404</title>', status: 404, hydrationMode: 'none' };
    }
    return {
      html: '<p>page ' + url + '</p>',
      head: '<title>' + url + '</title>',
      status: 200,
      lang: 'de',
      hydrationMode: 'none',
    };
  },
};
`;

async function createBuiltSite(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'karui-prerender-'));

  await mkdir(path.join(root, 'dist/client/.vite'), { recursive: true });
  await mkdir(path.join(root, 'dist/server'), { recursive: true });

  await writeFile(path.join(root, 'index.html'), TEMPLATE, 'utf8');
  await writeFile(
    path.join(root, 'dist/client/.vite/manifest.json'),
    JSON.stringify({ 'src/app.tsx': { file: 'assets/app-abc.js', css: ['assets/app-abc.css'] } }),
    'utf8'
  );
  await writeFile(path.join(root, 'dist/server/app.js'), SERVER_MODULE, 'utf8');

  return root;
}

describe('collectPrerenderPaths', () => {
  it('takes static routes and expands staticPaths for dynamic ones', async () => {
    const paths = await collectPrerenderPaths([
      { path: '/' },
      { path: '/about' },
      { path: '/docs/:slug', staticPaths: () => [{ slug: 'intro' }, { slug: 'api' }] },
    ]);

    expect(paths).toEqual(['/', '/about', '/docs/intro', '/docs/api']);
  });

  it('skips dynamic routes with no staticPaths export', async () => {
    const paths = await collectPrerenderPaths([{ path: '/' }, { path: '/admin/:id' }]);

    expect(paths).toEqual(['/']);
  });

  it('awaits an async staticPaths', async () => {
    const paths = await collectPrerenderPaths([
      { path: '/p/:id', staticPaths: async () => [{ id: '1' }] },
    ]);

    expect(paths).toEqual(['/p/1']);
  });

  it('url-encodes param values', async () => {
    const paths = await collectPrerenderPaths([
      { path: '/tag/:name', staticPaths: () => [{ name: 'a b/c' }] },
    ]);

    expect(paths).toEqual(['/tag/a%20b%2Fc']);
  });

  it('reports a missing param instead of writing a broken path', async () => {
    await expect(
      collectPrerenderPaths([{ path: '/p/:id', staticPaths: () => [{}] }])
    ).rejects.toThrow('missing param "id"');
  });

  it('fills a catch-all route from the wild param', async () => {
    const paths = await collectPrerenderPaths([
      { path: '/files/*', staticPaths: () => [{ wild: 'a/b.txt' }] },
    ]);

    expect(paths).toEqual(['/files/a/b.txt']);
  });
});

describe('prerenderSite', () => {
  it('writes discovered routes to nested index.html files', async () => {
    const root = await createBuiltSite();
    const pages = await prerenderSite({ root });

    expect(pages.map((page) => page.file).sort()).toEqual([
      'about/index.html',
      'docs/api/index.html',
      'docs/intro/index.html',
      'index.html',
    ]);

    const home = await readFile(path.join(root, 'dist/static/index.html'), 'utf8');
    expect(home).toContain('<p>page /</p>');
    expect(home).toContain('<title>/</title>');
  });

  it('applies the meta lang to the html tag', async () => {
    const root = await createBuiltSite();
    await prerenderSite({ root });

    const home = await readFile(path.join(root, 'dist/static/index.html'), 'utf8');
    expect(home).toContain('<html lang="de">');
  });

  it('omits the client script for zero-JS pages', async () => {
    const root = await createBuiltSite();
    await prerenderSite({ root });

    const home = await readFile(path.join(root, 'dist/static/index.html'), 'utf8');
    expect(home).toContain('assets/app-abc.css');
    expect(home).not.toContain('assets/app-abc.js');
  });

  it('skips redirect routes, which have no body to write', async () => {
    const root = await createBuiltSite();
    const pages = await prerenderSite({ root });

    expect(pages.some((page) => page.path === '/go')).toBe(false);
  });

  it('writes the not-found page to 404.html', async () => {
    const root = await createBuiltSite();
    const pages = await prerenderSite({ root, notFoundPath: '/404' });

    expect(pages.find((page) => page.path === '/404')?.file).toBe('404.html');
    const notFound = await readFile(path.join(root, 'dist/static/404.html'), 'utf8');
    expect(notFound).toContain('<p>missing</p>');
  });

  it('renders only the given paths when asked', async () => {
    const root = await createBuiltSite();
    const pages = await prerenderSite({ root, onlyExplicitPaths: true, paths: ['/about'] });

    expect(pages.map((page) => page.path)).toEqual(['/about']);
  });

  it('honours a custom output directory', async () => {
    const root = await createBuiltSite();
    await prerenderSite({ root, outDir: 'out', onlyExplicitPaths: true, paths: ['/about'] });

    const page = await readFile(path.join(root, 'out/about/index.html'), 'utf8');
    expect(page).toContain('<p>page /about</p>');
  });

  it('reports progress with byte sizes', async () => {
    const root = await createBuiltSite();
    const seen: string[] = [];

    const pages = await prerenderSite({
      root,
      onProgress: (page) => seen.push(page.path),
    });

    expect(seen.length).toBe(pages.length);
    expect(pages.every((page) => page.bytes > 0)).toBe(true);
  });
});
