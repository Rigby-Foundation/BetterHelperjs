import { mount, renderToString } from '../jsx/index.js';
import type { VNodeChild } from '../jsx/jsx-runtime.js';
import { NotFoundError, type Router } from '../router/index.js';

export interface ShellRenderProps<State> {
  state: State;
  status: number;
  title: string;
  children: VNodeChild;
  /** @deprecated Use `children` instead. Will be removed in 3.2.0. */
  content: VNodeChild;
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
  forceNotFound?: boolean;
  error?: unknown;
}

export interface RenderWithRouterResult {
  html: string;
  status: number;
  title: string;
  routeTitle: string;
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
      content: route.node,
      setState: () => {},
    })
  );

  return {
    html,
    status: route.status,
    title,
    routeTitle,
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
}

export function mountWithRouter<State>(options: MountWithRouterOptions<State>): () => void {
  const getUrl = options.getUrl ?? ((state: State) => {
    const value = (state as { url?: string }).url;
    return typeof value === 'string' ? value : '/';
  });

  const setUrl = options.setUrl ?? ((state: State, url: string) => ({ ...(state as Record<string, unknown>), url } as State));

  let state = { ...options.initialState };
  let routeData: unknown;
  let routeDataUrl: string | null = null;
  let renderToken = 0;

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

      mount(
        options.root,
        options.shell({
          state,
          status: route.status,
          title: routeTitle,
          children: route.node,
          content: route.node,
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

  rerender(getUrl(state), true);

  return () => {
    stop();
  };
}
