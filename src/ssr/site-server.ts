import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeState, type CounterRenderState } from '../core/state.js';

interface RenderResult {
  html: string;
  head: string;
  status: number;
  state: CounterRenderState;
}

interface SiteModule {
  site: {
    render(url: string): Promise<RenderResult>;
  };
}

interface ManifestChunk {
  file: string;
  css?: string[];
}

type Manifest = Record<string, ManifestChunk>;

interface DevViteServer {
  middlewares: (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void;
  transformIndexHtml(url: string, html: string): Promise<string>;
  ssrLoadModule(modulePath: string): Promise<unknown>;
  ssrFixStacktrace(error: Error): void;
}

interface ViteModule {
  createServer(options: Record<string, unknown>): Promise<DevViteServer>;
}

export interface ConventionSiteServerOptions {
  root?: string;
  port?: number;
  templateFile?: string;
  appModulePath?: string;
  viteConfigFile?: string;
  clientDistDir?: string;
  serverDistDir?: string;
}

function applyTemplate(template: string, rendered: RenderResult, scripts: string): string {
  return template
    .replace('<!--app-head-->', `${rendered.head}\n${scripts}`)
    .replace('<!--app-html-->', rendered.html)
    .replace('<!--app-state-->', serializeState(rendered.state))
    .replace('<!--app-scripts-->', '');
}

function resolveManifestEntryKey(manifest: Manifest, preferred: string): string | null {
  if (manifest[preferred]) return preferred;

  for (const key of Object.keys(manifest)) {
    if (key.endsWith(preferred)) return key;
  }

  return null;
}

function createPreloadTags(manifest: Manifest, entry: string): string {
  const chunk = manifest[entry];
  if (!chunk) return '';

  const tags: string[] = [];

  if (Array.isArray(chunk.css)) {
    for (const cssFile of chunk.css) {
      tags.push(`<link rel="stylesheet" href="/${cssFile}">`);
    }
  }

  tags.push(`<script type="module" src="/${chunk.file}"></script>`);
  return tags.join('');
}

function contentTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs': return 'application/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.map': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.ico': return 'image/x-icon';
    case '.txt': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function writeHtml(response: ServerResponse, status: number, body: string): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(body);
}

function safeStaticPath(rootDir: string, requestPath: string): string | null {
  const decodedPath = decodeURIComponent(requestPath);
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, `.${decodedPath}`);

  if (!resolved.startsWith(root)) {
    return null;
  }

  return resolved;
}

async function serveStatic(response: ServerResponse, method: string, rootDir: string, requestPath: string): Promise<boolean> {
  const staticPath = safeStaticPath(rootDir, requestPath);
  if (!staticPath) return false;

  let fileStat;
  try {
    fileStat = await stat(staticPath);
  } catch {
    return false;
  }

  if (!fileStat.isFile()) {
    return false;
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', contentTypeForPath(staticPath));
  response.setHeader('Content-Length', String(fileStat.size));

  if (requestPath.startsWith('/assets/')) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    response.setHeader('Cache-Control', 'public, max-age=3600');
  }

  if (method === 'HEAD') {
    response.end();
    return true;
  }

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(staticPath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(response);
  });

  return true;
}

async function importVite(): Promise<ViteModule> {
  try {
    return (await import('vite')) as unknown as ViteModule;
  } catch {
    throw new Error(
      '[better-helperjs/ssr/site-server] "vite" is required in development mode. Install it in your app: npm i -D vite'
    );
  }
}

async function loadProd(options: Required<ConventionSiteServerOptions>): Promise<{
  template: string;
  render: (url: string) => Promise<RenderResult>;
  scripts: string;
}> {
  const templatePath = path.resolve(options.root, options.templateFile);
  const manifestPath = path.resolve(options.root, options.clientDistDir, '.vite/manifest.json');
  const serverEntryPath = path.resolve(options.root, options.serverDistDir, 'app.js');

  const [template, manifestRaw] = await Promise.all([
    readFile(templatePath, 'utf8'),
    readFile(manifestPath, 'utf8'),
  ]);

  const manifest = JSON.parse(manifestRaw) as Manifest;
  const entry = resolveManifestEntryKey(manifest, options.appModulePath.replace(/^\//, ''));
  const scripts = entry ? createPreloadTags(manifest, entry) : '';

  const moduleUrl = pathToFileURL(serverEntryPath).href;
  const serverModule = (await import(moduleUrl)) as SiteModule;

  return {
    template,
    render: (url: string) => serverModule.site.render(url),
    scripts,
  };
}

async function runDevMiddlewares(vite: DevViteServer, request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  await new Promise<void>((resolve, reject) => {
    vite.middlewares(request, response, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return response.writableEnded;
}

export async function createConventionSiteServer(options: ConventionSiteServerOptions = {}): Promise<void> {
  const normalized: Required<ConventionSiteServerOptions> = {
    root: options.root ?? process.cwd(),
    port: options.port ?? Number(process.env.PORT ?? 4173),
    templateFile: options.templateFile ?? 'index.html',
    appModulePath: options.appModulePath ?? '/src/app.tsx',
    viteConfigFile: options.viteConfigFile ?? 'vite.config.ts',
    clientDistDir: options.clientDistDir ?? 'dist/client',
    serverDistDir: options.serverDistDir ?? 'dist/server',
  };

  const isProd = process.env.NODE_ENV === 'production';

  let vite: DevViteServer | undefined;
  let template = '';
  let render: ((url: string) => Promise<RenderResult>) | undefined;
  let prodScripts = '';
  let clientDistRoot = '';

  if (!isProd) {
    const viteModule = await importVite();
    vite = await viteModule.createServer({
      root: normalized.root,
      configFile: path.resolve(normalized.root, normalized.viteConfigFile),
      appType: 'custom',
      server: { middlewareMode: true },
    });
  } else {
    const loaded = await loadProd(normalized);
    template = loaded.template;
    render = loaded.render;
    prodScripts = loaded.scripts;
    clientDistRoot = path.resolve(normalized.root, normalized.clientDistDir);
  }

  const server = createServer(async (request, response) => {
    const method = (request.method ?? 'GET').toUpperCase();
    const requestUrl = request.url ?? '/';
    const parsedUrl = new URL(requestUrl, 'http://localhost');
    const url = `${parsedUrl.pathname}${parsedUrl.search}`;

    if (method !== 'GET' && method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      response.end('Method Not Allowed');
      return;
    }

    try {
      if (!isProd && vite) {
        const handledByVite = await runDevMiddlewares(vite, request, response);
        if (handledByVite) return;

        const templatePath = path.resolve(normalized.root, normalized.templateFile);
        let devTemplate = await readFile(templatePath, 'utf8');
        devTemplate = devTemplate.replace('<!--app-scripts-->', `<script type="module" src="${normalized.appModulePath}"></script>`);
        devTemplate = await vite.transformIndexHtml(url, devTemplate);

        const module = (await vite.ssrLoadModule(normalized.appModulePath)) as SiteModule;
        const rendered = await module.site.render(url);
        const html = applyTemplate(devTemplate, rendered, '');

        writeHtml(response, rendered.status, html);
        return;
      }

      const isAssetRequest = parsedUrl.pathname.startsWith('/assets/')
        || /\.[A-Za-z0-9]+$/.test(parsedUrl.pathname);

      if (isAssetRequest) {
        const served = await serveStatic(response, method, clientDistRoot, parsedUrl.pathname);
        if (served) return;
      }

      const rendered = await render!(url);
      const html = applyTemplate(template, rendered, prodScripts);
      writeHtml(response, rendered.status, html);
    } catch (error) {
      if (vite && error instanceof Error) {
        vite.ssrFixStacktrace(error);
      }

      console.error(error);
      response.statusCode = 500;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end('Internal Server Error');
    }
  });

  server.listen(normalized.port, () => {
    const mode = isProd ? 'prod' : 'dev';
    console.log(`[site:ssr:${mode}] http://localhost:${normalized.port}`);
  });
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1];

if (invokedFile && currentFile === invokedFile) {
  createConventionSiteServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
