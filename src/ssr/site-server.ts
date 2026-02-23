import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import express, { type Request, type Response } from 'express';
import { createServer as createViteServer, type Manifest, type ViteDevServer } from 'vite';

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

async function loadProd(options: Required<ConventionSiteServerOptions>): Promise<{ template: string; render: (url: string) => Promise<RenderResult>; scripts: string }> {
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
  const app = express();

  let vite: ViteDevServer | undefined;
  let template = '';
  let render: ((url: string) => Promise<RenderResult>) | undefined;
  let prodScripts = '';

  if (!isProd) {
    vite = await createViteServer({
      root: normalized.root,
      configFile: path.resolve(normalized.root, normalized.viteConfigFile),
      appType: 'custom',
      server: { middlewareMode: true },
    });

    app.use(vite.middlewares);
  } else {
    const loaded = await loadProd(normalized);
    template = loaded.template;
    render = loaded.render;
    prodScripts = loaded.scripts;

    app.use('/assets', express.static(path.resolve(normalized.root, normalized.clientDistDir, 'assets'), { index: false }));
    app.use(express.static(path.resolve(normalized.root, normalized.clientDistDir), { index: false }));
  }

  app.use(async (req: Request, res: Response) => {
    try {
      const url = req.originalUrl;

      if (!isProd) {
        const templatePath = path.resolve(normalized.root, normalized.templateFile);
        let devTemplate = await readFile(templatePath, 'utf8');
        devTemplate = devTemplate.replace('<!--app-scripts-->', `<script type="module" src="${normalized.appModulePath}"></script>`);
        devTemplate = await vite!.transformIndexHtml(url, devTemplate);

        const module = (await vite!.ssrLoadModule(normalized.appModulePath)) as SiteModule;
        const rendered = await module.site.render(url);
        const html = applyTemplate(devTemplate, rendered, '');

        res.status(rendered.status).setHeader('Content-Type', 'text/html').end(html);
        return;
      }

      const rendered = await render!(url);
      const html = applyTemplate(template, rendered, prodScripts);
      res.status(rendered.status).setHeader('Content-Type', 'text/html').end(html);
    } catch (error) {
      if (vite) {
        vite.ssrFixStacktrace(error as Error);
      }

      console.error(error);
      res.status(500).end('Internal Server Error');
    }
  });

  app.listen(normalized.port, () => {
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
