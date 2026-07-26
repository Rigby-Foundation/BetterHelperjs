import { createRenderState, serializeState, type RenderState } from '../core/state.js';
import { detectRuntime } from '../core/runtime.js';
import type { VNodeChild } from '../jsx/jsx-runtime.js';
import { createFileRouter, type FileRouteModule, type FileSystemModule } from '../router/file-based.js';
import {
  isMutationMethod,
  NotFoundError,
  RedirectError,
  type MatchedRoute,
  type RouteActionContext,
  type RouteContext,
  type RouteDefinition,
  type RouteErrorContext,
  type RouteMeta,
  type RouteRenderOptions,
  type RouteRequest,
} from '../router/index.js';
import { renderHead } from './head.js';
import { collectIslands, hydrateIslands, serializeIslands, type IslandPayloadEntry } from './islands.js';
import {
  mountWithRouter,
  renderWithRouter,
  type RenderWithRouterResult,
  type ShellRenderProps,
  type ShellRenderer,
} from './runtime.js';
import type { HydrationMode } from './template.js';

export interface SiteConfig<State extends RenderState = RenderState> {
  pages: Record<string, FileSystemModule<State>>;
  shell: ShellRenderer<State>;
  /**
   * Build the per-request state. Override it to carry app data (a session, a
   * feature flag) alongside the url/runtime/generatedAt baseline.
   */
  createState?: (url: string, runtime: string) => State;
  titlePrefix?: string;
  defaultTitle?: string;
  pagesRoot?: string;
  notFoundFile?: string;
  errorFile?: string;
  errorTitle?: string;
  stateKey?: string;
  islandsKey?: string;
  dataKey?: string;
  hydrateMode?: HydrationMode;
}

export type SiteRouteContext<State extends RenderState = RenderState> = RouteContext<State>;
export type SiteActionContext<State extends RenderState = RenderState> = RouteActionContext<State>;
export type SiteErrorContext<State extends RenderState = RenderState> = RouteErrorContext<State>;
export type SiteLayoutProps<State extends RenderState = RenderState> = ShellRenderProps<State>;
export type SiteLayout<State extends RenderState = RenderState> = (props: SiteLayoutProps<State>) => VNodeChild;
// Re-exported here because every site type is generic over it.
export type { RenderState };
export type { FileRouteModule, FileSystemModule, HydrationMode };

export interface SiteRenderResult<State extends RenderState = RenderState> {
  html: string;
  status: number;
  title: string;
  head: string;
  meta: RouteMeta;
  lang?: string;
  /** Set when a loader or action redirected; the caller should send a 3xx. */
  redirect?: { location: string; status: number };
  state: State;
  hydrationMode: HydrationMode;
  stateKey: string;
  statePayload: string;
  islandsKey: string;
  islandsPayload: IslandPayloadEntry[];
  islandsPayloadJson: string;
  dataKey: string;
  dataPayload: string;
}

export interface Site<State extends RenderState = RenderState> {
  readonly hydrationMode: HydrationMode;
  /** Route table, so tooling (the prerenderer, sitemaps) can enumerate pages. */
  readonly routes: RouteDefinition<State>[];
  render(url: string, request?: RouteRequest): Promise<SiteRenderResult<State>>;
  hydrate(): () => void;
}

function normalizeRouteUrl(input: string | URL): URL {
  if (input instanceof URL) return input;
  if (/^https?:\/\//.test(input)) return new URL(input);
  return new URL(input, 'http://localhost');
}

interface LoadRouteDataResult {
  data: unknown;
  redirect?: { location: string; status: number };
  routeRenderOptions: RouteRenderOptions;
}

async function loadRouteData<State>(
  url: string | URL,
  state: State,
  matched: MatchedRoute<State> | null,
  request?: RouteRequest
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
      request,
    });

    return {
      data,
      routeRenderOptions: {
        data,
      },
    };
  } catch (error) {
    if (error instanceof RedirectError) {
      return {
        data: undefined,
        redirect: { location: error.location, status: error.status },
        routeRenderOptions: {},
      };
    }

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

export function createSite<State extends RenderState = RenderState>(config: SiteConfig<State>): Site<State> {
  const hydrationMode: HydrationMode = config.hydrateMode ?? 'full';
  const router = createFileRouter<State>(config.pages, {
    pagesRoot: config.pagesRoot ?? './pages',
    notFoundFile: config.notFoundFile,
    notFoundTitle: config.defaultTitle ?? '404',
    errorFile: config.errorFile,
    errorTitle: config.errorTitle ?? 'Error',
  });

  const buildState = config.createState
    ?? ((url: string, runtime: string) => createRenderState(url, runtime) as State);

  const titlePrefix = config.titlePrefix;
  const defaultTitle = config.defaultTitle ?? 'Untitled';
  const stateKey = config.stateKey ?? '__STATE__';
  const islandsKey = config.islandsKey ?? '__KARUI_ISLANDS__';
  const dataKey = config.dataKey ?? '__KARUI_DATA__';

  const emptyResult = (
    state: State,
    status: number,
    redirect?: { location: string; status: number }
  ): SiteRenderResult<State> => ({
    html: '',
    status,
    title: '',
    head: '',
    meta: {},
    redirect,
    state,
    hydrationMode,
    stateKey,
    statePayload: 'null',
    islandsKey,
    islandsPayload: [],
    islandsPayloadJson: '[]',
    dataKey,
    dataPayload: 'null',
  });

  return {
    hydrationMode,
    routes: router.routes,
    async render(url: string, request?: RouteRequest): Promise<SiteRenderResult<State>> {
      const state = buildState(url, detectRuntime());
      const matched = router.resolve(url);

      let actionData: unknown;
      let actionStatus: number | undefined;
      let actionOverrides: RouteRenderOptions = {};

      // A mutation runs its action first, then re-renders the page with the
      // fresh loader data — so a plain <form method="post"> works with no JS.
      if (request && isMutationMethod(request.method)) {
        const outcome = await router.runAction(url, state, request);

        if (outcome.redirect) {
          return emptyResult(state, outcome.redirect.status, outcome.redirect);
        }

        if (outcome.unsupported) {
          actionStatus = 405;
        } else if (outcome.notFound) {
          actionOverrides = { forceNotFound: true };
        } else if (outcome.error !== undefined) {
          actionOverrides = { error: outcome.error };
        } else {
          actionData = outcome.data;
        }
      }

      const loaded = await loadRouteData(url, state, matched, request);

      if (loaded.redirect) {
        return emptyResult(state, loaded.redirect.status, loaded.redirect);
      }

      const renderOptions = {
        router,
        url,
        state,
        shell: config.shell,
        titlePrefix,
        defaultTitle,
        data: loaded.data,
        actionData,
        request,
        forceNotFound: actionOverrides.forceNotFound ?? loaded.routeRenderOptions.forceNotFound,
        error: actionOverrides.error ?? loaded.routeRenderOptions.error,
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
      // Handing the server's loader result to the client keeps the first
      // client render identical to the markup it is hydrating.
      const dataPayload = hydrationMode === 'full'
        ? serializeState(rendered.data ?? null)
        : 'null';

      return {
        ...rendered,
        status: actionStatus ?? rendered.status,
        head: renderHead(rendered.meta, rendered.title),
        lang: rendered.meta.lang,
        state,
        hydrationMode,
        stateKey,
        statePayload,
        islandsKey,
        islandsPayload,
        islandsPayloadJson,
        dataKey,
        dataPayload,
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
      const initialState = (win[stateKey] as State | undefined)
        ?? buildState(`${window.location.pathname}${window.location.search}`, 'browser');
      const serverData = win[dataKey];

      return mountWithRouter({
        root,
        router,
        initialState,
        initialData: serverData === undefined || serverData === null ? undefined : serverData,
        hydrate: true,
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

export interface LayoutSiteConfig<State extends RenderState = RenderState>
  extends Omit<SiteConfig<State>, 'shell'> {
  layout: SiteLayout<State>;
}

/**
 * A site whose shell is a layout component. Hydrates itself on import in the
 * browser, so `src/app.tsx` is the only client entry an app needs.
 */
export function createLayoutSite<State extends RenderState = RenderState>(
  config: LayoutSiteConfig<State>
): Site<State> {
  const { layout, ...rest } = config;
  const hydrateMode = config.hydrateMode ?? 'full';

  const site = createSite<State>({
    ...rest,
    shell: layout,
    hydrateMode,
  });

  if (hydrateMode !== 'none' && typeof window !== 'undefined') {
    site.hydrate();
  }

  return site;
}

export const defineSite = createLayoutSite;
