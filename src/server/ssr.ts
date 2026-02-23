import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import express from 'express';
import { createServer as createViteServer, type Manifest, type ViteDevServer } from 'vite';

import { serializeState, type SsrAppState } from '../ssr/view.js';

interface RenderResult {
  html: string;
  head: string;
  status: number;
  state: SsrAppState;
}

type RenderFn = (url: string) => Promise<RenderResult>;

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

function resolveManifestEntryKey(manifest: Manifest, preferred: string): string | null {
  if (manifest[preferred]) return preferred;

  for (const key of Object.keys(manifest)) {
    if (key.endsWith(preferred)) return key;
  }

  return null;
}

function applyTemplate(template: string, rendered: RenderResult, scripts: string): string {
  return template
    .replace('<!--app-head-->', `${rendered.head}\n${scripts}`)
    .replace('<!--app-html-->', rendered.html)
    .replace('<!--app-state-->', serializeState(rendered.state))
    .replace('<!--app-scripts-->', '');
}

async function loadProdRenderer(root: string): Promise<{ template: string; render: RenderFn; preload: string }> {
  const templatePath = path.resolve(root, 'ssr/index.html');
  const manifestPath = path.resolve(root, 'dist/ssr/client/.vite/manifest.json');
  const entryPath = path.resolve(root, 'dist/ssr/server/entry-server.js');

  const [template, manifestRaw] = await Promise.all([readFile(templatePath, 'utf8'), readFile(manifestPath, 'utf8')]);
  const manifest = JSON.parse(manifestRaw) as Manifest;

  const moduleUrl = pathToFileURL(entryPath).href;
  const serverEntry = (await import(moduleUrl)) as { render: RenderFn };
  const manifestEntry = resolveManifestEntryKey(manifest, 'src/ssr/entry-client.ts');

  return {
    template,
    render: serverEntry.render,
    preload: manifestEntry ? createPreloadTags(manifest, manifestEntry) : '',
  };
}

export async function createSsrServer(): Promise<void> {
  const app = express();
  const root = process.cwd();
  const isProd = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT ?? 5173);

  let vite: ViteDevServer | undefined;
  let prodTemplate = '';
  let prodRender: RenderFn | undefined;
  let prodPreload = '';

  if (!isProd) {
    vite = await createViteServer({
      root,
      configFile: false,
      resolve: {
        alias: {
          'better-helperjs/jsx-runtime': path.resolve(root, 'src/jsx/jsx-runtime.ts'),
          'better-helperjs/jsx-dev-runtime': path.resolve(root, 'src/jsx/jsx-dev-runtime.ts'),
        },
      },
      esbuild: {
        jsx: 'automatic',
        jsxImportSource: 'better-helperjs',
      },
      appType: 'custom',
      server: { middlewareMode: true },
    });

    app.use(vite.middlewares);
  } else {
    const loaded = await loadProdRenderer(root);
    prodTemplate = loaded.template;
    prodRender = loaded.render;
    prodPreload = loaded.preload;

    app.use('/assets', express.static(path.resolve(root, 'dist/ssr/client/assets'), { index: false }));
    app.use(express.static(path.resolve(root, 'dist/ssr/client'), { index: false }));
  }

  app.use(async (req, res) => {
    try {
      const url = req.originalUrl;

      if (!isProd) {
        const templatePath = path.resolve(root, 'ssr/index.html');
        let template = await readFile(templatePath, 'utf8');
        template = template.replace('<!--app-scripts-->', '<script type="module" src="/src/ssr/entry-client.ts"></script>');
        template = await vite!.transformIndexHtml(url, template);

        const module = (await vite!.ssrLoadModule('/src/ssr/entry-server.ts')) as { render: RenderFn };
        const rendered = await module.render(url);
        const html = applyTemplate(template, rendered, '');

        res.status(rendered.status).setHeader('Content-Type', 'text/html').end(html);
        return;
      }

      const rendered = await prodRender!(url);
      const html = applyTemplate(prodTemplate, rendered, prodPreload);
      res.status(rendered.status).setHeader('Content-Type', 'text/html').end(html);
    } catch (error) {
      if (vite) {
        vite.ssrFixStacktrace(error as Error);
      }

      console.error(error);
      res.status(500).end('Internal Server Error');
    }
  });

  app.listen(port, () => {
    const mode = isProd ? 'prod' : 'dev';
    console.log(`[ssr:${mode}] http://localhost:${port}`);
  });
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1];

if (invokedFile && currentFile === invokedFile) {
  createSsrServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
