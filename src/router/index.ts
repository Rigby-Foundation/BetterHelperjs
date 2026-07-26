import { jsx, type VNodeChild } from '../jsx/jsx-runtime.js';
import type { RouteRequest } from './request.js';

export type RouteParams = Record<string, string>;

export interface RouteContext<State = unknown> {
  url: URL;
  pathname: string;
  searchParams: URLSearchParams;
  params: RouteParams;
  state: State;
  data: unknown;
  /** Result returned by this route's `action`, when one just ran. */
  actionData?: unknown;
  /** Present on server renders; absent during client navigation. */
  request?: RouteRequest;
}

/** Document metadata for a route. Values are emitted into `<head>`. */
export interface RouteMeta {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  /** Sets the `lang` attribute on `<html>`. */
  lang?: string;
  /** Open Graph properties, without the `og:` prefix. */
  og?: Record<string, string | number | undefined>;
  /** Twitter card properties, without the `twitter:` prefix. */
  twitter?: Record<string, string | number | undefined>;
  /** Arbitrary `<meta>` tags: each record becomes one tag's attributes. */
  meta?: Array<Record<string, string | number | boolean | undefined>>;
  /** Arbitrary `<link>` tags: each record becomes one tag's attributes. */
  link?: Array<Record<string, string | number | boolean | undefined>>;
}

/** Route metadata, either fixed or derived from the resolved route context. */
export type RouteMetaInput<State = unknown> = RouteMeta | ((ctx: RouteContext<State>) => RouteMeta);

export type RouteComponent<State = unknown> = (ctx: RouteContext<State>) => VNodeChild;
export type RouteLoader<State = unknown> = (ctx: RouteContext<State>) => unknown | Promise<unknown>;
export type RouteAction<State = unknown> = (ctx: RouteActionContext<State>) => unknown | Promise<unknown>;

export interface RouteActionContext<State = unknown> extends RouteContext<State> {
  request: RouteRequest;
}

export interface RouteErrorContext<State = unknown> extends RouteContext<State> {
  error: unknown;
}
export type RouteErrorBoundary<State = unknown> = (ctx: RouteErrorContext<State>) => VNodeChild;

/** Parameter sets to prerender for a dynamic route. */
export type RouteStaticPaths = () => RouteParams[] | Promise<RouteParams[]>;

export interface RouteDefinition<State = unknown> {
  path: string;
  component: RouteComponent<State>;
  title?: string;
  meta?: RouteMetaInput<State>;
  loader?: RouteLoader<State>;
  action?: RouteAction<State>;
  staticPaths?: RouteStaticPaths;
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
  meta: RouteMeta;
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

/** Outcome of running a route's `action`. */
export interface RouteActionOutcome {
  status: number;
  data?: unknown;
  redirect?: { location: string; status: number };
  notFound?: boolean;
  error?: unknown;
  /** No route matched, or the matched route exports no `action`. */
  unsupported?: boolean;
}

export interface Router<State = unknown> {
  readonly routes: RouteDefinition<State>[];
  resolve(input: string | URL): MatchedRoute<State> | null;
  render(input: string | URL, state: State, options?: RouteRenderOptions): RouteRenderResult<State>;
  runAction(input: string | URL, state: State, request: RouteRequest): Promise<RouteActionOutcome>;
  build(path: string, params?: RouteParams, query?: Record<string, string | number | boolean | undefined>): string;
  navigate(to: string, options?: { replace?: boolean }): void;
  start(listener: (url: string) => void): () => void;
}

export interface RouteRenderOptions {
  data?: unknown;
  actionData?: unknown;
  request?: RouteRequest;
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

/**
 * Thrown by `redirect()`. Loaders and actions raise it the same way they raise
 * `NotFoundError`; the server turns it into a `Location` header and the client
 * turns it into a navigation.
 */
export class RedirectError extends Error {
  public readonly location: string;
  public readonly status: number;

  constructor(location: string, status = 302) {
    super(`Redirect to ${location}`);
    this.name = 'RedirectError';
    this.location = location;
    this.status = status;
  }
}

/**
 * Stop rendering and send the visitor somewhere else.
 *
 * Use 303 after a successful mutation so a browser reload does not resubmit
 * the form — that is the default when redirecting out of an `action`.
 */
export function redirect(location: string, status = 302): never {
  throw new RedirectError(location, status);
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

function resolveRouteMeta<State>(route: RouteDefinition<State>, context: RouteContext<State>): RouteMeta {
  const resolved = typeof route.meta === 'function' ? route.meta(context) : route.meta;
  const meta: RouteMeta = { ...resolved };

  // `title` on the route definition stays the fallback so existing routes and
  // the file-based title resolver keep working unchanged.
  if (meta.title === undefined && route.title !== undefined) {
    meta.title = route.title;
  }

  return meta;
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
      actionData: renderOptions.actionData,
      request: renderOptions.request,
    };

    const renderNotFound = (): RouteRenderResult<State> => ({
      status: 404,
      title: options.notFoundTitle ?? 'Not Found',
      meta: { title: options.notFoundTitle ?? 'Not Found', robots: 'noindex' },
      matched: null,
      context,
      node: options.notFound ? options.notFound(context) : null,
      data: renderOptions.data,
    });

    const renderError = (error: unknown, routeMatch: MatchedRoute<State> | null): RouteRenderResult<State> => {
      // Redirects are control flow, not failures: never swallow them here.
      if (error instanceof RedirectError) {
        throw error;
      }

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
        meta: { title: options.errorTitle ?? 'Error', robots: 'noindex' },
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
        const meta = resolveRouteMeta(matched.route, context);

        return {
          status: 200,
          title: meta.title ?? matched.route.title ?? '',
          meta,
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

  async function runAction(
    input: string | URL,
    state: State,
    request: RouteRequest
  ): Promise<RouteActionOutcome> {
    const url = normalizeUrl(input);
    const matched = resolve(url);
    const action = matched?.route.action;

    if (!matched || !action) {
      return { status: 405, unsupported: true };
    }

    const context: RouteActionContext<State> = {
      url,
      pathname: url.pathname,
      searchParams: url.searchParams,
      params: matched.params,
      state,
      data: undefined,
      request,
    };

    try {
      return { status: 200, data: await action(context) };
    } catch (error) {
      if (error instanceof RedirectError) {
        return {
          status: error.status,
          redirect: { location: error.location, status: error.status },
        };
      }

      if (error instanceof NotFoundError) {
        return { status: 404, notFound: true };
      }

      return { status: 500, error };
    }
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
    runAction,
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

export * from './request.js';
