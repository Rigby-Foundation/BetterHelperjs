import { createCounterRenderState, type CounterRenderState } from '../core/state.js';
import { detectRuntime } from '../core/runtime.js';
import { createFileRouter, type FileRouteModule, type FileSystemModule } from '../router/file-based.js';
import type { MatchedRoute, RouteContext } from '../router/index.js';
import { mountWithRouter, renderWithRouter, type ShellRenderer } from './runtime.js';

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
  stateKey?: string;
}

export type CounterSiteState = CounterRenderState;
export type CounterSiteRouteContext = RouteContext<CounterRenderState>;
export type { FileRouteModule, FileSystemModule };

export interface CounterSiteRenderResult {
  html: string;
  status: number;
  title: string;
  head: string;
  state: CounterRenderState;
}

export interface CounterSite {
  render(url: string): Promise<CounterSiteRenderResult>;
  hydrate(): () => void;
}

function normalizeRouteUrl(input: string | URL): URL {
  if (input instanceof URL) return input;
  if (/^https?:\/\//.test(input)) return new URL(input);
  return new URL(input, 'http://localhost');
}

async function loadRouteData<State>(
  url: string | URL,
  state: State,
  matched: MatchedRoute<State> | null
): Promise<unknown> {
  const loader = matched?.route.loader;
  if (!loader) return undefined;

  const parsed = matched?.url ?? normalizeRouteUrl(url);
  const data = await loader({
    url: parsed,
    pathname: parsed.pathname,
    searchParams: parsed.searchParams,
    params: matched?.params ?? {},
    state,
    data: undefined,
  });

  return data;
}

export function createCounterSite(config: CounterSiteConfig): CounterSite {
  const router = createFileRouter<CounterRenderState>(config.pages, {
    pagesRoot: config.pagesRoot ?? './pages',
    notFoundFile: config.notFoundFile ?? `${config.pagesRoot ?? './pages'}/404.tsx`,
    notFoundTitle: config.defaultTitle ?? '404',
  });

  const titlePrefix = config.titlePrefix;
  const defaultTitle = config.defaultTitle ?? 'Untitled';
  const stateKey = config.stateKey ?? '__STATE__';

  return {
    async render(url: string): Promise<CounterSiteRenderResult> {
      const state = createCounterRenderState(url, detectRuntime());
      const matched = router.resolve(url);
      const data = await loadRouteData(url, state, matched);

      const rendered = renderWithRouter({
        router,
        url,
        state,
        shell: config.shell,
        titlePrefix,
        defaultTitle,
        data,
      });

      return {
        ...rendered,
        head: `<title>${escapeHtml(rendered.title)}</title>`,
        state,
      };
    },

    hydrate(): () => void {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return () => {};
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
          return loadRouteData(url, state, matched);
        },
      });
    },
  };
}
