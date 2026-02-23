import { createCounterRenderState, serializeState, type CounterRenderState } from '../core/state.js';
import { detectRuntime } from '../core/runtime.js';
import { createFileRouter, type FileRouteModule, type FileSystemModule } from '../router/file-based.js';
import {
  NotFoundError,
  type MatchedRoute,
  type RouteContext,
  type RouteErrorContext,
  type RouteRenderOptions,
} from '../router/index.js';
import { collectIslands, hydrateIslands, serializeIslands, type IslandPayloadEntry } from './islands.js';
import { mountWithRouter, renderWithRouter, type RenderWithRouterResult, type ShellRenderer } from './runtime.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface CounterSiteConfig {
  pages: Record<string, FileSystemModule<CounterRenderState>>;
  shell: ShellRenderer<CounterRenderState>;
  titlePrefix?: string;
  defaultTitle?: string;
  pagesRoot?: string;
  notFoundFile?: string;
  errorFile?: string;
  errorTitle?: string;
  stateKey?: string;
  islandsKey?: string;
  hydrateMode?: CounterSiteHydrationMode;
}

export type CounterSiteHydrationMode = 'full' | 'islands' | 'none';
export type CounterSiteState = CounterRenderState;
export type CounterSiteRouteContext = RouteContext<CounterRenderState>;
export type CounterSiteErrorContext = RouteErrorContext<CounterRenderState>;
export type { FileRouteModule, FileSystemModule };

export interface CounterSiteRenderResult {
  html: string;
  status: number;
  title: string;
  head: string;
  state: CounterRenderState;
  hydrationMode: CounterSiteHydrationMode;
  stateKey: string;
  statePayload: string;
  islandsKey: string;
  islandsPayload: IslandPayloadEntry[];
  islandsPayloadJson: string;
}

export interface CounterSite {
  readonly hydrationMode: CounterSiteHydrationMode;
  render(url: string): Promise<CounterSiteRenderResult>;
  hydrate(): () => void;
}

function normalizeRouteUrl(input: string | URL): URL {
  if (input instanceof URL) return input;
  if (/^https?:\/\//.test(input)) return new URL(input);
  return new URL(input, 'http://localhost');
}

interface LoadRouteDataResult {
  data: unknown;
  routeRenderOptions: RouteRenderOptions;
}

async function loadRouteData<State>(
  url: string | URL,
  state: State,
  matched: MatchedRoute<State> | null
): Promise<LoadRouteDataResult> {
  const loader = matched?.route.loader;
  if (!loader) {
    return {
      data: undefined,
      routeRenderOptions: {},
    };
  }

  const parsed = matched?.url ?? normalizeRouteUrl(url);
  try {
    const data = await loader({
      url: parsed,
      pathname: parsed.pathname,
      searchParams: parsed.searchParams,
      params: matched?.params ?? {},
      state,
      data: undefined,
    });

    return {
      data,
      routeRenderOptions: {
        data,
      },
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return {
        data: undefined,
        routeRenderOptions: {
          forceNotFound: true,
        },
      };
    }

    return {
      data: undefined,
      routeRenderOptions: {
        error,
      },
    };
  }
}

function resolveHydrationMode(config: CounterSiteConfig): CounterSiteHydrationMode {
  return config.hydrateMode ?? 'full';
}

export function createCounterSite(config: CounterSiteConfig): CounterSite {
  const hydrationMode = resolveHydrationMode(config);
  const router = createFileRouter<CounterRenderState>(config.pages, {
    pagesRoot: config.pagesRoot ?? './pages',
    notFoundFile: config.notFoundFile,
    notFoundTitle: config.defaultTitle ?? '404',
    errorFile: config.errorFile,
    errorTitle: config.errorTitle ?? 'Error',
  });

  const titlePrefix = config.titlePrefix;
  const defaultTitle = config.defaultTitle ?? 'Untitled';
  const stateKey = config.stateKey ?? '__STATE__';
  const islandsKey = config.islandsKey ?? '__BH_ISLANDS__';

  return {
    hydrationMode,
    async render(url: string): Promise<CounterSiteRenderResult> {
      const state = createCounterRenderState(url, detectRuntime());
      const matched = router.resolve(url);
      const loaded = await loadRouteData(url, state, matched);
      const renderOptions = {
        router,
        url,
        state,
        shell: config.shell,
        titlePrefix,
        defaultTitle,
        data: loaded.data,
        forceNotFound: loaded.routeRenderOptions.forceNotFound,
        error: loaded.routeRenderOptions.error,
      };

      let rendered: RenderWithRouterResult;
      let islandsPayload: IslandPayloadEntry[] = [];

      if (hydrationMode === 'islands') {
        const collected = collectIslands(() => renderWithRouter(renderOptions));
        rendered = collected.result;
        islandsPayload = collected.islands;
      } else {
        rendered = renderWithRouter(renderOptions);
      }

      const statePayload = hydrationMode === 'full'
        ? serializeState(state)
        : 'null';
      const islandsPayloadJson = hydrationMode === 'islands'
        ? serializeIslands(islandsPayload)
        : '[]';

      return {
        ...rendered,
        head: `<title>${escapeHtml(rendered.title)}</title>`,
        state,
        hydrationMode,
        stateKey,
        statePayload,
        islandsKey,
        islandsPayload,
        islandsPayloadJson,
      };
    },

    hydrate(): () => void {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return () => {};
      }

      if (hydrationMode === 'none') {
        return () => {};
      }

      if (hydrationMode === 'islands') {
        return hydrateIslands({
          stateKey: islandsKey,
        });
      }

      const root = document.querySelector('#app');
      if (!root) {
        return () => {};
      }

      const win = window as unknown as Record<string, unknown>;
      const initialState = (win[stateKey] as CounterRenderState | undefined)
        ?? createCounterRenderState(`${window.location.pathname}${window.location.search}`, 'browser');

      return mountWithRouter({
        root,
        router,
        initialState,
        shell: config.shell,
        titlePrefix,
        defaultTitle,
        setUrl: (state, nextUrl) => ({
          ...state,
          url: nextUrl,
        }),
        loadData: async (url, state) => {
          const matched = router.resolve(url);
          const loaded = await loadRouteData(url, state, matched);
          if (loaded.routeRenderOptions.forceNotFound) {
            throw new NotFoundError();
          }
          if (loaded.routeRenderOptions.error !== undefined) {
            throw loaded.routeRenderOptions.error;
          }
          return loaded.data;
        },
      });
    },
  };
}
