import { jsx, type VNodeChild } from '../jsx/jsx-runtime.js';

export type RouteParams = Record<string, string>;

export interface RouteContext<State = unknown> {
  url: URL;
  pathname: string;
  searchParams: URLSearchParams;
  params: RouteParams;
  state: State;
  data: unknown;
}

export type RouteComponent<State = unknown> = (ctx: RouteContext<State>) => VNodeChild;
export type RouteLoader<State = unknown> = (ctx: RouteContext<State>) => unknown | Promise<unknown>;
export interface RouteErrorContext<State = unknown> extends RouteContext<State> {
  error: unknown;
}
export type RouteErrorBoundary<State = unknown> = (ctx: RouteErrorContext<State>) => VNodeChild;

export interface RouteDefinition<State = unknown> {
  path: string;
  component: RouteComponent<State>;
  title?: string;
  loader?: RouteLoader<State>;
  errorBoundary?: RouteErrorBoundary<State>;
}

export interface MatchedRoute<State = unknown> {
  route: RouteDefinition<State>;
  params: RouteParams;
  pathname: string;
  url: URL;
}

export interface RouteRenderResult<State = unknown> {
  status: number;
  title: string;
  matched: MatchedRoute<State> | null;
  context: RouteContext<State>;
  node: VNodeChild;
  data: unknown;
  error?: unknown;
}

export interface CreateRouterOptions<State = unknown> {
  notFound?: RouteComponent<State>;
  notFoundTitle?: string;
  errorBoundary?: RouteErrorBoundary<State>;
  errorTitle?: string;
}

interface CompiledRoute<State> {
  route: RouteDefinition<State>;
  regex: RegExp;
  params: string[];
}

export interface Router<State = unknown> {
  readonly routes: RouteDefinition<State>[];
  resolve(input: string | URL): MatchedRoute<State> | null;
  render(input: string | URL, state: State, options?: RouteRenderOptions): RouteRenderResult<State>;
  build(path: string, params?: RouteParams, query?: Record<string, string | number | boolean | undefined>): string;
  navigate(to: string, options?: { replace?: boolean }): void;
  start(listener: (url: string) => void): () => void;
}

export interface RouteRenderOptions {
  data?: unknown;
  forceNotFound?: boolean;
  error?: unknown;
}

export class NotFoundError extends Error {
  public readonly status = 404;

  constructor(message = 'Not Found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function notFound(message?: string): never {
  throw new NotFoundError(message);
}

export interface LinkProps {
  href?: string;
  to?: string;
  replace?: boolean;
  children?: VNodeChild | VNodeChild[];
  [key: string]: unknown;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePath(path: string): { regex: RegExp; params: string[] } {
  if (path === '*' || path === '/*') {
    return { regex: /^.*$/, params: [] };
  }

  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/') {
    return { regex: /^\/?$/, params: [] };
  }

  const paramNames: string[] = [];
  const segments = normalized.split('/').filter(Boolean);
  const patternSegments: string[] = [];

  for (const segment of segments) {
    if (segment === '*') {
      paramNames.push('wild');
      patternSegments.push('(.*)');
      continue;
    }

    if (segment.startsWith(':')) {
      paramNames.push(segment.slice(1));
      patternSegments.push('([^/]+)');
      continue;
    }

    patternSegments.push(escapePattern(segment));
  }

  return {
    regex: new RegExp(`^/${patternSegments.join('/')}/?$`),
    params: paramNames,
  };
}

function resolveBaseUrl(base?: string): string {
  if (base) return base;
  if (typeof window !== 'undefined') return window.location.href;
  return 'http://localhost';
}

function normalizeUrl(input: string | URL, base?: string): URL {
  if (input instanceof URL) return input;

  if (/^https?:\/\//.test(input)) {
    return new URL(input);
  }

  return new URL(input, resolveBaseUrl(base));
}

function getCurrentPath(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

export function createRouter<State = unknown>(
  routes: RouteDefinition<State>[],
  options: CreateRouterOptions<State> = {}
): Router<State> {
  const compiledRoutes: CompiledRoute<State>[] = routes.map((route) => {
    const compiled = compilePath(route.path);
    return {
      route,
      regex: compiled.regex,
      params: compiled.params,
    };
  });

  const listeners = new Set<(url: string) => void>();

  function resolve(input: string | URL): MatchedRoute<State> | null {
    const url = normalizeUrl(input);
    const pathname = url.pathname;

    for (const compiled of compiledRoutes) {
      const match = pathname.match(compiled.regex);
      if (!match) continue;

      const params: RouteParams = {};
      for (let index = 0; index < compiled.params.length; index += 1) {
        params[compiled.params[index]] = decodeURIComponent(match[index + 1] ?? '');
      }

      return {
        route: compiled.route,
        params,
        pathname,
        url,
      };
    }

    return null;
  }

  function render(input: string | URL, state: State, renderOptions: RouteRenderOptions = {}): RouteRenderResult<State> {
    const url = normalizeUrl(input);
    const matched = renderOptions.forceNotFound ? null : resolve(url);

    const context: RouteContext<State> = {
      url,
      pathname: url.pathname,
      searchParams: url.searchParams,
      params: matched?.params ?? {},
      state,
      data: renderOptions.data,
    };

    const renderNotFound = (): RouteRenderResult<State> => ({
      status: 404,
      title: options.notFoundTitle ?? 'Not Found',
      matched: null,
      context,
      node: options.notFound ? options.notFound(context) : null,
      data: renderOptions.data,
    });

    const renderError = (error: unknown, routeMatch: MatchedRoute<State> | null): RouteRenderResult<State> => {
      if (error instanceof NotFoundError) {
        return renderNotFound();
      }

      const boundary = routeMatch?.route.errorBoundary ?? options.errorBoundary;
      if (!boundary) {
        throw error;
      }

      return {
        status: 500,
        title: options.errorTitle ?? 'Error',
        matched: routeMatch,
        context,
        node: boundary({
          ...context,
          error,
        }),
        data: renderOptions.data,
        error,
      };
    };

    if (renderOptions.forceNotFound) {
      return renderNotFound();
    }

    if (renderOptions.error !== undefined) {
      return renderError(renderOptions.error, matched);
    }

    if (matched) {
      try {
        return {
          status: 200,
          title: matched.route.title ?? '',
          matched,
          context,
          node: matched.route.component(context),
          data: renderOptions.data,
        };
      } catch (error) {
        return renderError(error, matched);
      }
    }

    return renderNotFound();
  }

  function notify(nextUrl: string): void {
    for (const listener of listeners) {
      listener(nextUrl);
    }
  }

  function navigate(to: string, navigationOptions: { replace?: boolean } = {}): void {
    if (typeof window === 'undefined') {
      throw new Error('navigate() is available only in browser runtime');
    }

    const next = normalizeUrl(to);
    const output = `${next.pathname}${next.search}${next.hash}`;

    if (navigationOptions.replace) {
      window.history.replaceState(null, '', output);
    } else {
      window.history.pushState(null, '', output);
    }

    notify(getCurrentPath());
  }

  function start(listener: (url: string) => void): () => void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return () => {};
    }

    listeners.add(listener);

    const onPopState = (): void => {
      notify(getCurrentPath());
    };

    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[data-link]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.hasAttribute('download')) return;

      const targetValue = anchor.getAttribute('target');
      if (targetValue && targetValue.toLowerCase() !== '_self') return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      const next = normalizeUrl(href, window.location.href);
      if (next.origin !== window.location.origin) return;

      event.preventDefault();
      navigate(`${next.pathname}${next.search}${next.hash}`, {
        replace: anchor.hasAttribute('data-link-replace'),
      });
    };

    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick);

    return () => {
      listeners.delete(listener);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick);
    };
  }

  function build(path: string, params: RouteParams = {}, query: Record<string, string | number | boolean | undefined> = {}): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    const builtPath = normalizedPath.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
      const value = params[key];
      if (value == null) {
        throw new Error(`Missing route param: ${key}`);
      }
      return encodeURIComponent(value);
    });

    const search = new URLSearchParams();
    for (const key of Object.keys(query)) {
      const value = query[key];
      if (value == null) continue;
      search.set(key, String(value));
    }

    const searchText = search.toString();
    return searchText ? `${builtPath}?${searchText}` : builtPath;
  }

  return {
    routes,
    resolve,
    render,
    build,
    navigate,
    start,
  };
}

export function Link(props: LinkProps): VNodeChild {
  const { href, to, replace, children, ...rest } = props;
  const nextHref = typeof href === 'string' ? href : typeof to === 'string' ? to : '#';
  const linkProps: Record<string, unknown> = {
    ...rest,
    href: nextHref,
    children,
    'data-link': true,
  };

  if (replace) {
    linkProps['data-link-replace'] = true;
  }

  return jsx<Record<string, unknown>>('a', linkProps);
}
