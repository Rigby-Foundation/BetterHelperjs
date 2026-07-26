import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { RouteParams, RouteStaticPaths } from '../router/index.js';
import {
  applyTemplate,
  createPreloadTags,
  resolveHydrationMode,
  resolveManifestEntryKey,
  type Manifest,
  type RenderedPage,
} from './template.js';

/** The parts of a route the prerenderer needs, independent of its state type. */
export interface PrerenderRoute {
  path: string;
  staticPaths?: RouteStaticPaths;
}

/** The parts of a built site module the prerenderer needs. */
export interface PrerenderableSite {
  render(url: string): Promise<RenderedPage>;
  routes?: readonly PrerenderRoute[];
}

export interface PrerenderOptions {
  root?: string;
  /** HTML template with the `<!--app-*-->` placeholders. */
  templateFile?: string;
  /** Client build directory, for the asset manifest. */
  clientDistDir?: string;
  /** Server build directory containing `app.js`. */
  serverDistDir?: string;
  /** Where the `.html` files land. */
  outDir?: string;
  /** Entry module path as it appears in the client manifest. */
  appModulePath?: string;
  /** Extra paths to render on top of the ones discovered from the routes. */
  paths?: string[];
  /** Render this path to `404.html` for host-level not-found handling. */
  notFoundPath?: string;
  /** Skip route discovery and render only `paths`. */
  onlyExplicitPaths?: boolean;
  onProgress?: (entry: PrerenderedPage) => void;
}

export interface PrerenderedPage {
  path: string;
  file: string;
  status: number;
  bytes: number;
}

function isStaticPath(routePath: string): boolean {
  return !routePath.includes(':') && !routePath.includes('*');
}

/** `/` → `index.html`, `/about` → `about/index.html`. */
function outputFileFor(routePath: string): string {
  const trimmed = routePath.split('?')[0].replace(/^\/+|\/+$/g, '');
  return trimmed ? path.join(trimmed, 'index.html') : 'index.html';
}

function fillParams(routePath: string, params: RouteParams): string {
  const filled = routePath.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const value = params[key];
    if (value == null) {
      throw new Error(`staticPaths for "${routePath}" is missing param "${key}"`);
    }
    return encodeURIComponent(value);
  });

  // A catch-all consumes whatever `wild` holds.
  if (filled.includes('*')) {
    return filled.replace('*', encodeURI(params.wild ?? ''));
  }

  return filled;
}

/**
 * Expand a route list into concrete URLs.
 *
 * Static routes come along automatically. Dynamic routes are included only
 * when the page exports `staticPaths()`, so a missing export means "render
 * this one on demand" rather than a silent gap.
 */
export async function collectPrerenderPaths(routes: readonly PrerenderRoute[]): Promise<string[]> {
  const paths: string[] = [];

  for (const route of routes) {
    if (isStaticPath(route.path)) {
      paths.push(route.path);
      continue;
    }

    if (!route.staticPaths) continue;

    for (const params of await route.staticPaths()) {
      paths.push(fillParams(route.path, params));
    }
  }

  return paths;
}

async function loadBuiltSite(options: Required<Pick<PrerenderOptions,
  'root' | 'templateFile' | 'clientDistDir' | 'serverDistDir' | 'appModulePath'>>): Promise<{
  site: PrerenderableSite;
  template: string;
  manifest: Manifest;
  entry: string | null;
}> {
  const templatePath = path.resolve(options.root, options.templateFile);
  const manifestPath = path.resolve(options.root, options.clientDistDir, '.vite/manifest.json');
  const serverEntryPath = path.resolve(options.root, options.serverDistDir, 'app.js');

  const [template, manifestRaw] = await Promise.all([
    readFile(templatePath, 'utf8'),
    readFile(manifestPath, 'utf8'),
  ]);

  const manifest = JSON.parse(manifestRaw) as Manifest;
  const serverModule = (await import(pathToFileURL(serverEntryPath).href)) as { site: PrerenderableSite };

  return {
    site: serverModule.site,
    template,
    manifest,
    entry: resolveManifestEntryKey(manifest, options.appModulePath.replace(/^\//, '')),
  };
}

/**
 * Render a built site to static HTML files.
 *
 * Pairs naturally with `hydrateMode: 'none'`: the output is complete pages
 * that need no JavaScript and no Node process to serve.
 */
export async function prerenderSite(options: PrerenderOptions = {}): Promise<PrerenderedPage[]> {
  const normalized = {
    root: options.root ?? process.cwd(),
    templateFile: options.templateFile ?? 'index.html',
    clientDistDir: options.clientDistDir ?? 'dist/client',
    serverDistDir: options.serverDistDir ?? 'dist/server',
    appModulePath: options.appModulePath ?? '/src/app.tsx',
  };

  const outDir = path.resolve(normalized.root, options.outDir ?? 'dist/static');
  const { site, template, manifest, entry } = await loadBuiltSite(normalized);

  const discovered = options.onlyExplicitPaths || !site.routes
    ? []
    : await collectPrerenderPaths(site.routes);

  const targets = [...new Set([...discovered, ...(options.paths ?? [])])];

  if (options.notFoundPath) {
    targets.push(options.notFoundPath);
  }

  const results: PrerenderedPage[] = [];

  for (const target of targets) {
    const rendered = await site.render(target);

    if (rendered.redirect) {
      // A redirect has no body to write; the host needs a real rule for it.
      continue;
    }

    const scripts = entry
      ? createPreloadTags(manifest, entry, resolveHydrationMode(rendered) !== 'none')
      : '';
    const html = applyTemplate(template, rendered, scripts, '');

    const relativeFile = options.notFoundPath === target && rendered.status === 404
      ? '404.html'
      : outputFileFor(target);
    const outputPath = path.join(outDir, relativeFile);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, 'utf8');

    const entryResult: PrerenderedPage = {
      path: target,
      file: relativeFile,
      status: rendered.status,
      bytes: Buffer.byteLength(html),
    };

    results.push(entryResult);
    options.onProgress?.(entryResult);
  }

  return results;
}
