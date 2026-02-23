import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface TemplateContext {
  projectName: string;
  frameworkVersion: string;
}

export interface ScaffoldProjectOptions extends TemplateContext {
  targetDir: string;
  force?: boolean;
}

const DEFAULT_TEMPLATE_FILES: Record<string, (context: TemplateContext) => string> = {
  'package.json': ({ projectName, frameworkVersion }) => JSON.stringify(
    {
      name: projectName,
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts: {
        dev: 'tsx server.ts',
        build: 'npm run build:client && npm run build:server',
        'build:client': 'vite build',
        'build:server': 'vite build --ssr src/app.tsx --outDir dist/server',
        start: 'NODE_ENV=production tsx server.ts',
        check: 'tsc -p tsconfig.json --noEmit',
      },
      dependencies: {
        'better-helperjs': `^${frameworkVersion}`,
      },
      devDependencies: {
        '@types/node': '^24.3.0',
        tsx: '^4.20.5',
        typescript: '^5.7.3',
        vite: '^7.3.1',
      },
    },
    null,
    2
  ),
  'tsconfig.json': () => JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: true,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        types: ['node', 'vite/client'],
        jsx: 'react-jsx',
        jsxImportSource: 'better-helperjs',
      },
      include: ['src/**/*.ts', 'src/**/*.tsx', 'server.ts'],
    },
    null,
    2
  ),
  'vite.config.ts': () => [
    "import { resolve } from 'node:path';",
    "import { defineConfig } from 'vite';",
    '',
    'export default defineConfig({',
    '  esbuild: {',
    "    jsx: 'automatic',",
    "    jsxImportSource: 'better-helperjs',",
    '  },',
    '  build: {',
    "    outDir: 'dist/client',",
    '    emptyOutDir: true,',
    '    sourcemap: true,',
    '    manifest: true,',
    '    rollupOptions: {',
    "      input: resolve(__dirname, 'src/app.tsx'),",
    '    },',
    '  },',
    '});',
    '',
  ].join('\n'),
  'index.html': () => [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '    <!--app-head-->',
    '  </head>',
    '  <body>',
    '    <div id="app"><!--app-html--></div>',
    '    <script>',
    '      window.__SITE_STATE__ = <!--app-state-->',
    '    </script>',
    '    <!--app-bootstrap-->',
    '    <!--app-scripts-->',
    '  </body>',
    '</html>',
    '',
  ].join('\n'),
  'server.ts': () => [
    "import { createConventionSiteServer } from 'better-helperjs/ssr/site-server';",
    '',
    'createConventionSiteServer().catch((error) => {',
    '  console.error(error);',
    '  process.exit(1);',
    '});',
    '',
  ].join('\n'),
  'src/app.tsx': () => [
    "import { defineCounterSite, type CounterSiteState, type FileSystemModule } from 'better-helperjs/ssr';",
    "import Layout from './layout.js';",
    '',
    "const pages = import.meta.glob('./pages/**/*.tsx', { eager: true }) as Record<string, FileSystemModule<CounterSiteState>>;",
    '',
    'export const site = defineCounterSite({',
    '  pages,',
    '  layout: Layout,',
    "  titlePrefix: 'BetterHelper App',",
    "  defaultTitle: 'Untitled',",
    "  pagesRoot: './pages',",
    "  notFoundFile: './pages/404.tsx',",
    "  errorFile: './pages/error.tsx',",
    "  stateKey: '__SITE_STATE__',",
    "  hydrateMode: 'full',",
    '  autoHydrate: true,',
    '});',
    '',
  ].join('\n'),
  'src/layout.tsx': () => [
    "import type { CounterSiteLayoutProps } from 'better-helperjs/ssr';",
    "import { Link } from 'better-helperjs/router';",
    '',
    'const shellStyle = [',
    "  'max-width:960px',",
    "  'margin:0 auto',",
    "  'padding:24px',",
    "  'font-family:ui-sans-serif,system-ui,sans-serif',",
    "].join(';');",
    '',
    'export default function Layout({ state, status, title, children, setState }: CounterSiteLayoutProps) {',
    '  return (',
    '    <main style={shellStyle}>',
    '      <header style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">',
    '        <h1 style="margin:0;">BetterHelper Framework</h1>',
    '        <span style="padding:2px 8px;border:1px solid #cfd9e8;border-radius:999px;font-size:12px;">HTTP {status}</span>',
    '      </header>',
    '',
    '      <nav style="display:flex;gap:10px;margin:0 0 14px;">',
    '        <Link href="/">home</Link>',
    '        <Link href="/about">about</Link>',
    '        <Link href="/docs/intro?tab=overview">docs</Link>',
    '      </nav>',
    '',
    '      <p style="margin:0 0 6px;">Page: <strong>{title}</strong></p>',
    '      <p style="margin:0 0 6px;">URL: <code>{state.url}</code></p>',
    '      <p style="margin:0 0 10px;">Runtime: <code>{state.runtime}</code></p>',
    '',
    '      <button',
    '        id="inc-btn"',
    '        style="padding:8px 12px;cursor:pointer;"',
    '        onClick={() => setState((current) => ({ ...current, count: current.count + 1 }))}',
    '      >',
    '        Count: <span id="count-value">{state.count}</span>',
    '      </button>',
    '',
    '      <section style="margin-top:14px;">{children}</section>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/pages/layout.tsx': () => [
    "import type { CounterSiteState } from 'better-helperjs/ssr';",
    "import type { FileLayoutProps } from 'better-helperjs/router/file-based';",
    '',
    'const sectionStyle = [',
    "  'margin-top:12px',",
    "  'padding:12px',",
    "  'border:1px solid #dbe4f0',",
    "  'border-radius:12px',",
    "  'background:#f8fbff',",
    "].join(';');",
    '',
    'export default function PagesLayout({ children, ctx }: FileLayoutProps<CounterSiteState>) {',
    '  return (',
    '    <section style={sectionStyle}>',
    '      <p style="margin:0 0 10px;font-size:12px;color:#476078;">',
    '        Shared pages layout: <code>{ctx.pathname}</code>',
    '      </p>',
    '      {children}',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/pages/index.tsx': () => [
    "import { Link } from 'better-helperjs/router';",
    "import type { CounterSiteRouteContext } from 'better-helperjs/ssr';",
    '',
    'export const meta = {',
    "  title: 'Home',",
    '};',
    '',
    'export default function HomePage(ctx: CounterSiteRouteContext) {',
    '  return (',
    '    <section>',
    '      <h2 style="margin:0 0 8px;">Home</h2>',
    '      <p style="margin:0 0 8px;">Project scaffold generated by BetterHelper CLI.</p>',
    '      <p style="margin:0 0 8px;">Current path: <code>{ctx.pathname}</code></p>',
    '      <p style="margin:0;">',
    '        Next: <Link href="/docs/intro?tab=api">/docs/intro</Link>',
    '      </p>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/pages/about.tsx': () => [
    "import type { CounterSiteRouteContext } from 'better-helperjs/ssr';",
    '',
    'export const meta = {',
    "  title: 'About',",
    '};',
    '',
    'interface AboutLoaderData {',
    '  loadedAt: string;',
    '}',
    '',
    'export function loader(): AboutLoaderData {',
    '  return {',
    '    loadedAt: new Date().toISOString(),',
    '  };',
    '}',
    '',
    'export default function AboutPage(ctx: CounterSiteRouteContext) {',
    '  const data = (ctx.data ?? null) as AboutLoaderData | null;',
    '',
    '  return (',
    '    <section>',
    '      <h2 style="margin:0 0 8px;">About</h2>',
    '      <p style="margin:0 0 8px;">Runtime: <code>{ctx.state.runtime}</code></p>',
    '      <p style="margin:0;">Loaded at: <code>{data?.loadedAt ?? "n/a"}</code></p>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/pages/docs/layout.tsx': () => [
    "import { Link } from 'better-helperjs/router';",
    "import type { CounterSiteState } from 'better-helperjs/ssr';",
    "import type { FileLayoutProps } from 'better-helperjs/router/file-based';",
    '',
    'const docsStyle = [',
    "  'margin-top:10px',",
    "  'padding:10px',",
    "  'border:1px dashed #b8c7dd',",
    "  'border-radius:10px',",
    "  'background:#fff',",
    "].join(';');",
    '',
    'export default function DocsLayout({ children }: FileLayoutProps<CounterSiteState>) {',
    '  return (',
    '    <div style={docsStyle}>',
    '      <p style="margin:0 0 8px;font-size:12px;">',
    '        Docs layout: <Link href="/docs/intro?tab=overview">overview</Link> · <Link href="/docs/intro?tab=api">api</Link>',
    '      </p>',
    '      {children}',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/pages/docs/[slug].tsx': () => [
    "import { Link } from 'better-helperjs/router';",
    "import type { CounterSiteRouteContext } from 'better-helperjs/ssr';",
    '',
    'export const meta = {',
    "  title: 'Docs',",
    '};',
    '',
    'interface DocsLoaderData {',
    '  slug: string;',
    '  tab: string;',
    '}',
    '',
    'export function loader(ctx: CounterSiteRouteContext): DocsLoaderData {',
    '  return {',
    "    slug: ctx.params.slug ?? 'unknown',",
    "    tab: ctx.searchParams.get('tab') ?? 'overview',",
    '  };',
    '}',
    '',
    'export default function DocsPage(ctx: CounterSiteRouteContext) {',
    '  const data = (ctx.data ?? null) as DocsLoaderData | null;',
    '  const slug = data?.slug ?? ctx.params.slug ?? "unknown";',
    '  const tab = data?.tab ?? "overview";',
    '',
    '  return (',
    '    <section>',
    '      <h2 style="margin:0 0 8px;">Docs</h2>',
    '      <p style="margin:0 0 8px;">Slug: <code>{slug}</code></p>',
    '      <p style="margin:0 0 8px;">Tab: <code>{tab}</code></p>',
    '      <p style="margin:0;">',
    '        <Link href="/docs/intro?tab=overview">overview</Link>',
    '        {" | "}',
    '        <Link href="/docs/intro?tab=api">api</Link>',
    '      </p>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/pages/404.tsx': () => [
    "import type { CounterSiteRouteContext } from 'better-helperjs/ssr';",
    '',
    'export const meta = {',
    "  title: '404',",
    '};',
    '',
    'export default function NotFoundPage(ctx: CounterSiteRouteContext) {',
    '  return (',
    '    <section>',
    '      <h2 style="margin:0 0 8px;">404</h2>',
    '      <p style="margin:0;">No page for <code>{ctx.pathname}</code></p>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/pages/error.tsx': () => [
    "import type { CounterSiteErrorContext } from 'better-helperjs/ssr';",
    '',
    'export const meta = {',
    "  title: 'Error',",
    '};',
    '',
    'export default function ErrorPage(ctx: CounterSiteErrorContext) {',
    '  const message = ctx.error instanceof Error ? ctx.error.message : String(ctx.error);',
    '',
    '  return (',
    '    <section>',
    '      <h2 style="margin:0 0 8px;">Error</h2>',
    '      <p style="margin:0 0 8px;">Unhandled route error: <code>{ctx.pathname}</code></p>',
    '      <pre style="margin:0;padding:10px;border:1px solid #eed3d3;border-radius:8px;background:#fff7f7;">',
    '        {message}',
    '      </pre>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'README.md': ({ projectName }) => [
    `# ${projectName}`,
    '',
    'Scaffolded with `better-helperjs` CLI.',
    '',
    '## Start',
    '',
    '```bash',
    'npm install',
    'npm run dev',
    '```',
    '',
    '## Build + Production',
    '',
    '```bash',
    'npm run build',
    'npm run start',
    '```',
    '',
  ].join('\n'),
};

export function createTemplateFiles(context: TemplateContext): Record<string, string> {
  const result: Record<string, string> = {};

  for (const relativePath of Object.keys(DEFAULT_TEMPLATE_FILES)) {
    result[relativePath] = DEFAULT_TEMPLATE_FILES[relativePath](context);
  }

  return result;
}

export async function directoryHasFiles(targetDir: string): Promise<boolean> {
  try {
    const entries = await readdir(targetDir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

export async function scaffoldProject(options: ScaffoldProjectOptions): Promise<string[]> {
  const { targetDir, force = false, ...context } = options;
  const hasFiles = await directoryHasFiles(targetDir);
  if (hasFiles && !force) {
    throw new Error(`Target directory "${targetDir}" is not empty. Use --force to overwrite.`);
  }

  await mkdir(targetDir, { recursive: true });

  const files = createTemplateFiles(context);
  const written: string[] = [];

  for (const relativePath of Object.keys(files)) {
    const absolutePath = path.join(targetDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, files[relativePath], 'utf8');
    written.push(relativePath);
  }

  return written;
}

export function parsePackageManager(input: string | undefined): PackageManagerName | null {
  if (!input) return null;
  if (input === 'npm' || input === 'pnpm' || input === 'yarn' || input === 'bun') {
    return input;
  }
  return null;
}

export function detectPackageManager(userAgent = process.env.npm_config_user_agent ?? ''): PackageManagerName {
  if (userAgent.startsWith('pnpm/')) return 'pnpm';
  if (userAgent.startsWith('yarn/')) return 'yarn';
  if (userAgent.startsWith('bun/')) return 'bun';
  return 'npm';
}

export function createInstallCommand(packageManager: PackageManagerName): { cmd: string; args: string[] } {
  switch (packageManager) {
    case 'pnpm':
      return { cmd: 'pnpm', args: ['install'] };
    case 'yarn':
      return { cmd: 'yarn', args: ['install'] };
    case 'bun':
      return { cmd: 'bun', args: ['install'] };
    case 'npm':
    default:
      return { cmd: 'npm', args: ['install'] };
  }
}

