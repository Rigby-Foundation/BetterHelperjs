import { mount, renderToString } from '../jsx/index.js';
import type { VNodeChild } from '../jsx/jsx-runtime.js';
import type { Router } from '../router/index.js';

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
}

export interface RenderWithRouterResult {
  html: string;
  status: number;
  title: string;
  routeTitle: string;
  data: unknown;
}

function resolvePageTitle(routeTitle: string, titlePrefix?: string, defaultTitle = 'Untitled'): string {
  const normalized = routeTitle || defaultTitle;
  if (!titlePrefix) return normalized;
  return `${titlePrefix} - ${normalized}`;
}

export function renderWithRouter<State>(options: RenderWithRouterOptions<State>): RenderWithRouterResult {
  const route = options.router.render(options.url, options.state, {
    data: options.data,
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
  };
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
      if (options.loadData && (forceDataLoad || routeDataUrl !== url)) {
        routeData = await options.loadData(url, state);
        routeDataUrl = url;
      }

      if (token !== renderToken) {
        return;
      }

      const route = options.router.render(url, state, {
        data: routeData,
      });
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

    void run();
  };

  const stop = options.router.start((url) => {
    rerender(url, true);
  });

  rerender(getUrl(state), true);

  return () => {
    stop();
  };
}
