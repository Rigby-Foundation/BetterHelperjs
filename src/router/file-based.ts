import type { VNodeChild } from '../jsx/jsx-runtime.js';
import {
  createRouter,
  type CreateRouterOptions,
  type RouteComponent,
  type RouteContext,
  type RouteDefinition,
  type RouteErrorBoundary,
  type RouteLoader,
  type Router,
} from './index.js';

export interface FileRouteMeta {
  title?: string;
  errorTitle?: string;
}

export interface FileRouteModule<State = unknown> {
  default: RouteComponent<State>;
  meta?: FileRouteMeta;
  loader?: RouteLoader<State>;
  errorBoundary?: RouteErrorBoundary<State>;
}

export interface FileErrorModule<State = unknown> {
  default: RouteErrorBoundary<State>;
  meta?: FileRouteMeta;
}

export interface FileLayoutProps<State = unknown> {
  children: VNodeChild;
  ctx: RouteContext<State>;
}

export type FileLayoutComponent<State = unknown> = (props: FileLayoutProps<State>) => VNodeChild;

export interface FileLayoutModule<State = unknown> {
  default: FileLayoutComponent<State>;
}

export type FileSystemModule<State = unknown> = FileRouteModule<State> | FileLayoutModule<State> | FileErrorModule<State>;

export interface FileRoutesBuildOptions<State = unknown> {
  pagesRoot?: string;
  notFoundFile?: string;
  notFoundTitle?: string;
  errorFile?: string;
  errorTitle?: string;
  titleFromPath?: (path: string) => string;
  routerOptions?: Omit<CreateRouterOptions<State>, 'notFound' | 'notFoundTitle' | 'errorBoundary' | 'errorTitle'>;
}

export interface FileRoutesBuildResult<State = unknown> {
  routes: RouteDefinition<State>[];
  notFound?: RouteComponent<State>;
  notFoundTitle: string;
  errorBoundary?: RouteErrorBoundary<State>;
  errorTitle: string;
}

export function filePathToRoutePath(file: string, pagesRoot = './pages'): string {
  let route = file.replace(pagesRoot, '').replace(/\.tsx$/, '').replace(/\.ts$/, '');

  if (route === '/index') return '/';
  route = route.replace(/\/index$/, '');

  route = route
    .split('/')
    .map((segment) => {
      if (/^\[\.\.\.[^\]]+\]$/.test(segment)) return '*';
      if (/^\[[^\]]+\]$/.test(segment)) return `:${segment.slice(1, -1)}`;
      return segment;
    })
    .join('/');

  if (!route.startsWith('/')) route = `/${route}`;
  return route || '/';
}

export function defaultTitleFromPath(path: string): string {
  if (path === '/') return 'Home';

  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith(':') ? segment.slice(1) : segment))
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' · ');
}

function scorePath(path: string): number {
  if (path === '/') return 1;

  return path
    .split('/')
    .filter(Boolean)
    .reduce((score, segment) => {
      if (segment === '*') return score - 5;
      if (segment.startsWith(':')) return score + 1;
      return score + 10;
    }, 0);
}

function isLayoutFile(file: string): boolean {
  return file.endsWith('/layout.tsx') || file.endsWith('/layout.ts');
}

function getDirectory(file: string): string {
  const index = file.lastIndexOf('/');
  if (index < 0) return '.';
  return file.slice(0, index);
}

function resolveDirectoriesForFile(file: string, pagesRoot: string): string[] {
  const fileDir = getDirectory(file);
  if (!fileDir.startsWith(pagesRoot)) {
    return [pagesRoot];
  }

  const suffix = fileDir.slice(pagesRoot.length);
  const parts = suffix.split('/').filter(Boolean);
  const directories: string[] = [pagesRoot];

  let current = pagesRoot;
  for (const part of parts) {
    current = `${current}/${part}`;
    directories.push(current);
  }

  return directories;
}

function resolveLayoutChain<State>(
  pages: Record<string, FileSystemModule<State>>,
  file: string,
  pagesRoot: string
): FileLayoutComponent<State>[] {
  const directories = resolveDirectoriesForFile(file, pagesRoot);
  const layouts: FileLayoutComponent<State>[] = [];

  for (const directory of directories) {
    const tsxKey = `${directory}/layout.tsx`;
    const tsKey = `${directory}/layout.ts`;
    const module = pages[tsxKey] ?? pages[tsKey];
    if (!module) continue;

    const layout = (module as FileLayoutModule<State>).default;
    if (typeof layout === 'function') {
      layouts.push(layout);
    }
  }

  return layouts;
}

function composeWithLayouts<State>(
  page: RouteComponent<State>,
  layouts: FileLayoutComponent<State>[]
): RouteComponent<State> {
  if (layouts.length === 0) {
    return page;
  }

  return (ctx) => {
    let node = page(ctx);

    for (let index = layouts.length - 1; index >= 0; index -= 1) {
      node = layouts[index]({
        children: node,
        ctx,
      });
    }

    return node;
  };
}

function composeErrorBoundaryWithLayouts<State>(
  errorBoundary: RouteErrorBoundary<State>,
  layouts: FileLayoutComponent<State>[]
): RouteErrorBoundary<State> {
  if (layouts.length === 0) {
    return errorBoundary;
  }

  return (ctx) => {
    let node = errorBoundary(ctx);

    for (let index = layouts.length - 1; index >= 0; index -= 1) {
      node = layouts[index]({
        children: node,
        ctx,
      });
    }

    return node;
  };
}

function resolveFirstExistingFile<State>(
  pages: Record<string, FileSystemModule<State>>,
  candidates: string[]
): string | undefined {
  for (const candidate of candidates) {
    if (candidate in pages) {
      return candidate;
    }
  }

  return undefined;
}

export function createFileRoutes<State = unknown>(
  pages: Record<string, FileSystemModule<State>>,
  options: FileRoutesBuildOptions<State> = {}
): FileRoutesBuildResult<State> {
  const pagesRoot = options.pagesRoot ?? './pages';
  const notFoundFile = options.notFoundFile
    ?? resolveFirstExistingFile(pages, [`${pagesRoot}/not-found.tsx`, `${pagesRoot}/404.tsx`])
    ?? `${pagesRoot}/404.tsx`;
  const errorFile = options.errorFile
    ?? resolveFirstExistingFile(pages, [`${pagesRoot}/error.tsx`])
    ?? `${pagesRoot}/error.tsx`;
  const titleResolver = options.titleFromPath ?? defaultTitleFromPath;

  const pagesMap = { ...pages };
  const notFoundModule = pagesMap[notFoundFile] as FileRouteModule<State> | undefined;
  const errorModule = pagesMap[errorFile] as FileErrorModule<State> | undefined;
  delete pagesMap[notFoundFile];
  delete pagesMap[errorFile];

  const routes = Object.keys(pagesMap)
    .filter((file) => !isLayoutFile(file))
    .map((file): RouteDefinition<State> | null => {
      const mod = pagesMap[file] as FileRouteModule<State> | undefined;
      if (typeof mod?.default !== 'function') return null;

      const path = filePathToRoutePath(file, pagesRoot);
      const layouts = resolveLayoutChain(pages, file, pagesRoot);

      return {
        path,
        title: mod.meta?.title ?? titleResolver(path),
        component: composeWithLayouts(mod.default, layouts),
        loader: mod.loader,
        errorBoundary: mod.errorBoundary
          ? composeErrorBoundaryWithLayouts(mod.errorBoundary, layouts)
          : undefined,
      };
    })
    .filter((route): route is RouteDefinition<State> => route !== null)
    .sort((a, b) => scorePath(b.path) - scorePath(a.path));

  let notFound: RouteComponent<State> | undefined;
  if (typeof notFoundModule?.default === 'function') {
    const layouts = resolveLayoutChain(pages, notFoundFile, pagesRoot);
    notFound = composeWithLayouts(notFoundModule.default, layouts);
  }

  let errorBoundary: RouteErrorBoundary<State> | undefined;
  if (typeof errorModule?.default === 'function') {
    const layouts = resolveLayoutChain(pages, errorFile, pagesRoot);
    errorBoundary = composeErrorBoundaryWithLayouts(errorModule.default, layouts);
  }

  return {
    routes,
    notFound,
    notFoundTitle: notFoundModule?.meta?.title ?? options.notFoundTitle ?? '404',
    errorBoundary,
    errorTitle: errorModule?.meta?.errorTitle ?? errorModule?.meta?.title ?? options.errorTitle ?? 'Error',
  };
}

export function createFileRouter<State = unknown>(
  pages: Record<string, FileSystemModule<State>>,
  options: FileRoutesBuildOptions<State> = {}
): Router<State> {
  const built = createFileRoutes(pages, options);

  return createRouter<State>(built.routes, {
    ...options.routerOptions,
    notFound: built.notFound,
    notFoundTitle: built.notFoundTitle,
    errorBoundary: built.errorBoundary,
    errorTitle: built.errorTitle,
  });
}
