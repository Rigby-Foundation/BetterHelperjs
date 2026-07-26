import { hydrate, mount, renderToString } from '../jsx/index.js';
import type { VNodeChild } from '../jsx/jsx-runtime.js';
import {
  NotFoundError,
  RedirectError,
  type RouteMeta,
  type RouteRequest,
  type Router,
} from '../router/index.js';

export interface ShellRenderProps<State> {
  state: State;
  status: number;
  title: string;
  children: VNodeChild;
  setState: (updater: (state: State) => State) => void;
}

export type ShellRenderer<State> = (props: ShellRenderProps<State>) => VNodeChild;

export interface RenderWithRouterOptions<State> {
  router: Router<State>;
  url: string;
  state: State;
  shell: ShellRenderer<State>;
  titlePrefix?: string;
  defaultTitle?: string;
  data?: unknown;
  actionData?: unknown;
  request?: RouteRequest;
  forceNotFound?: boolean;
  error?: unknown;
}

export interface RenderWithRouterResult {
  html: string;
  status: number;
  title: string;
  routeTitle: string;
  meta: RouteMeta;
  data: unknown;
  error?: unknown;
}

function resolvePageTitle(routeTitle: string, titlePrefix?: string, defaultTitle = 'Untitled'): string {
  const normalized = routeTitle || defaultTitle;
  if (!titlePrefix) return normalized;
  return `${titlePrefix} - ${normalized}`;
}

export function renderWithRouter<State>(options: RenderWithRouterOptions<State>): RenderWithRouterResult {
  const route = options.router.render(options.url, options.state, {
    data: options.data,
    actionData: options.actionData,
    request: options.request,
    forceNotFound: options.forceNotFound,
    error: options.error,
  });
  const routeTitle = route.title || options.defaultTitle || 'Untitled';
  const title = resolvePageTitle(routeTitle, options.titlePrefix, options.defaultTitle);

  const html = renderToString(
    options.shell({
      state: options.state,
      status: route.status,
      title: routeTitle,
      children: route.node,
      setState: () => {},
    })
  );

  return {
    html,
    status: route.status,
    title,
    routeTitle,
    meta: route.meta,
    data: route.data,
    error: route.error,
  };
}

export async function* renderWithRouterStream<State>(options: RenderWithRouterOptions<State>): AsyncGenerator<string> {
  const rendered = renderWithRouter(options);
  yield rendered.html;
}

export interface MountWithRouterOptions<State> {
  root: Element;
  router: Router<State>;
  initialState: State;
  shell: ShellRenderer<State>;
  titlePrefix?: string;
  defaultTitle?: string;
  getUrl?: (state: State) => string;
  setUrl?: (state: State, url: string) => State;
  loadData?: (url: string, state: State) => unknown | Promise<unknown>;
  onError?: (error: unknown, context: { url: string; state: State }) => void;
  /**
   * Loader data the server already resolved. Supplying it lets the first client
   * render reuse the server's data instead of refetching, which is what keeps
   * the hydrated tree identical to the markup on the page.
   */
  initialData?: unknown;
  /** Adopt the server-rendered DOM on the first render instead of replacing it. */
  hydrate?: boolean;
}

export function mountWithRouter<State>(options: MountWithRouterOptions<State>): () => void {
  const getUrl = options.getUrl ?? ((state: State) => {
    const value = (state as { url?: string }).url;
    return typeof value === 'string' ? value : '/';
  });

  const setUrl = options.setUrl ?? ((state: State, url: string) => ({ ...(state as Record<string, unknown>), url } as State));

  let state = { ...options.initialState };
  let routeData: unknown = options.initialData;
  let routeDataUrl: string | null = options.initialData === undefined ? null : getUrl(state);
  let renderToken = 0;

  // `hydrate` falls through to a normal patch once the root is live, so the
  // first render adopts server markup and every later one diffs.
  const render = options.hydrate ? hydrate : mount;

  const rerender = (nextUrl?: string, forceDataLoad = false): void => {
    if (nextUrl) {
      state = setUrl(state, nextUrl);
    }

    const url = getUrl(state);
    const token = ++renderToken;

    const run = async (): Promise<void> => {
      let forceNotFound = false;
      let routeError: unknown = undefined;

      if (options.loadData && (forceDataLoad || routeDataUrl !== url)) {
        try {
          routeData = await options.loadData(url, state);
        } catch (error) {
          routeData = undefined;

          // A loader redirect becomes a client navigation; the render that
          // follows belongs to the destination, not this URL.
          if (error instanceof RedirectError) {
            options.router.navigate(error.location, { replace: error.status === 301 || error.status === 303 });
            return;
          }

          if (error instanceof NotFoundError) {
            forceNotFound = true;
          } else {
            routeError = error;
          }
        }

        routeDataUrl = url;
      }

      if (token !== renderToken) {
        return;
      }

      let route: ReturnType<Router<State>['render']>;
      try {
        route = options.router.render(url, state, {
          data: routeData,
          forceNotFound,
          error: routeError,
        });
      } catch (error) {
        if (options.onError) {
          options.onError(error, { url, state });
          return;
        }
        throw error;
      }
      const routeTitle = route.title || options.defaultTitle || 'Untitled';
      const title = resolvePageTitle(routeTitle, options.titlePrefix, options.defaultTitle);

      const setState = (updater: (current: State) => State): void => {
        state = updater(state);
        rerender();
      };

      render(
        options.root,
        options.shell({
          state,
          status: route.status,
          title: routeTitle,
          children: route.node,
          setState,
        })
      );

      document.title = title;
    };

    void run().catch((error) => {
      if (options.onError) {
        options.onError(error, { url, state });
        return;
      }

      queueMicrotask(() => {
        throw error;
      });
    });
  };

  const stop = options.router.start((url) => {
    rerender(url, true);
  });

  rerender(getUrl(state), options.initialData === undefined);

  return () => {
    stop();
  };
}
