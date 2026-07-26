import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { RenderState } from '../core/state.js';
import { createRouteRequest, isMutationMethod, type RouteRequest } from '../router/request.js';
import { createHtmlChunkStream, streamToNodeResponse } from './stream.js';
import {
  applyTemplate,
  createPreloadTags,
  resolveHydrationMode,
  resolveManifestEntryKey,
  type HydrationMode,
  type Manifest,
} from './template.js';

interface RenderResult {
  html: string;
  head: string;
  status: number;
  lang?: string;
  redirect?: { location: string; status: number };
  state?: RenderState;
  hydrationMode?: HydrationMode;
  stateKey?: string;
  statePayload?: string;
  islandsKey?: string;
  islandsPayloadJson?: string;
  dataKey?: string;
  dataPayload?: string;
}

interface SiteModule {
  site: {
    render(url: string, request?: RouteRequest): Promise<RenderResult>;
  };
}

/** Bodies larger than this are rejected with 413 rather than buffered. */
const MAX_BODY_BYTES = 1_000_000;

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
  streaming?: boolean;
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

function writeRedirect(response: ServerResponse, location: string, status: number): void {
  response.statusCode = status;
  response.setHeader('Location', location);
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(`Redirecting to ${location}`);
}

async function readRequestBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;

      if (size > MAX_BODY_BYTES) {
        resolve(null);
        request.destroy();
        return;
      }

      chunks.push(buffer);
    });

    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function safeStaticPath(rootDir: string, requestPath: string): Promise<string | null> {
  if (requestPath.includes('\0')) return null;

  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, `.${requestPath}`);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return null;
  }

  let real: string;
  try {
    real = await realpath(resolved);
  } catch {
    return null;
  }

  if (!real.startsWith(root + path.sep) && real !== root) {
    return null;
  }

  return real;
}

async function serveStatic(response: ServerResponse, method: string, rootDir: string, requestPath: string): Promise<boolean> {
  const staticPath = await safeStaticPath(rootDir, requestPath);
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
      '[@rigbyhost/karui/ssr/site-server] "vite" is required in development mode. Install it in your app: npm i -D vite'
    );
  }
}

async function loadProd(options: Required<ConventionSiteServerOptions>): Promise<{
  template: string;
  render: (url: string, routeRequest?: RouteRequest) => Promise<RenderResult>;
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
  const entry = resolveManifestEntryKey(manifest, options.appModulePath.replace(/^\//, ''));
  const moduleUrl = pathToFileURL(serverEntryPath).href;
  const serverModule = (await import(moduleUrl)) as SiteModule;

  return {
    template,
    render: (url: string, routeRequest?: RouteRequest) => serverModule.site.render(url, routeRequest),
    manifest,
    entry,
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

export type SiteHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export async function createConventionSiteHandler(options: ConventionSiteServerOptions = {}): Promise<SiteHandler> {
  const normalized: Required<ConventionSiteServerOptions> = {
    root: options.root ?? process.cwd(),
    port: options.port ?? Number(process.env.PORT ?? 4173),
    templateFile: options.templateFile ?? 'index.html',
    appModulePath: options.appModulePath ?? '/src/app.tsx',
    viteConfigFile: options.viteConfigFile ?? 'vite.config.ts',
    clientDistDir: options.clientDistDir ?? 'dist/client',
    serverDistDir: options.serverDistDir ?? 'dist/server',
    streaming: options.streaming ?? true,
  };

  const isProd = process.env.NODE_ENV === 'production';

  let vite: DevViteServer | undefined;
  let template = '';
  let render: ((url: string, routeRequest?: RouteRequest) => Promise<RenderResult>) | undefined;
  let prodManifest: Manifest = {};
  let prodEntry: string | null = null;
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
    prodManifest = loaded.manifest;
    prodEntry = loaded.entry;
    clientDistRoot = path.resolve(normalized.root, normalized.clientDistDir);
  }

  return async (request: IncomingMessage, response: ServerResponse) => {
    const method = (request.method ?? 'GET').toUpperCase();
    const requestUrl = request.url ?? '/';
    const parsedUrl = new URL(requestUrl, 'http://localhost');
    const url = `${parsedUrl.pathname}${parsedUrl.search}`;

    const isMutation = isMutationMethod(method);

    if (method !== 'GET' && method !== 'HEAD' && !isMutation) {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD, POST, PUT, PATCH, DELETE');
      response.end('Method Not Allowed');
      return;
    }

    let routeRequest: RouteRequest | undefined;

    if (isMutation) {
      const body = await readRequestBody(request);

      if (body === null) {
        response.statusCode = 413;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end('Payload Too Large');
        return;
      }

      routeRequest = createRouteRequest(method, request.headers, body);
    }

    try {
      if (!isProd && vite) {
        const handledByVite = await runDevMiddlewares(vite, request, response);
        if (handledByVite) return;

        const templatePath = path.resolve(normalized.root, normalized.templateFile);
        let devTemplate = await readFile(templatePath, 'utf8');
        devTemplate = await vite.transformIndexHtml(url, devTemplate);

        const module = (await vite.ssrLoadModule(normalized.appModulePath)) as SiteModule;
        const rendered = await module.site.render(url, routeRequest);

        if (rendered.redirect) {
          writeRedirect(response, rendered.redirect.location, rendered.redirect.status);
          return;
        }

        const hydrationMode = resolveHydrationMode(rendered);
        const clientScript = hydrationMode === 'none'
          ? ''
          : `<script type="module" src="${normalized.appModulePath}"></script>`;
        const html = applyTemplate(devTemplate, rendered, '', clientScript);

        if (method === 'HEAD') {
          response.statusCode = rendered.status;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end();
          return;
        }

        if (normalized.streaming) {
          await streamToNodeResponse(response, createHtmlChunkStream(html), rendered.status);
          return;
        }

        writeHtml(response, rendered.status, html);
        return;
      }

      const isAssetRequest = parsedUrl.pathname.startsWith('/assets/')
        || /\.[A-Za-z0-9]+$/.test(parsedUrl.pathname);

      if (isAssetRequest) {
        const served = await serveStatic(response, method, clientDistRoot, parsedUrl.pathname);
        if (served) return;
      }

      const rendered = await render!(url, routeRequest);

      if (rendered.redirect) {
        writeRedirect(response, rendered.redirect.location, rendered.redirect.status);
        return;
      }

      const hydrationMode = resolveHydrationMode(rendered);
      const prodScripts = prodEntry
        ? createPreloadTags(prodManifest, prodEntry, hydrationMode !== 'none')
        : '';
      const html = applyTemplate(template, rendered, prodScripts, '');

      if (method === 'HEAD') {
        response.statusCode = rendered.status;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end();
        return;
      }

      if (normalized.streaming) {
        await streamToNodeResponse(response, createHtmlChunkStream(html), rendered.status);
        return;
      }

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
  };
}

export async function createConventionSiteServer(options: ConventionSiteServerOptions = {}): Promise<void> {
  const handler = await createConventionSiteHandler(options);
  const port = options.port ?? Number(process.env.PORT ?? 4173);
  
  const server = createServer(handler);

  server.listen(port, () => {
    const isProd = process.env.NODE_ENV === 'production';
    const mode = isProd ? 'prod' : 'dev';
    console.log(`[site:ssr:${mode}] http://localhost:${port}`);
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
