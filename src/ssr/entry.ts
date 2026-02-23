import { detectRuntime } from '../core/runtime.js';
import { renderWithRouter, type RenderWithRouterResult, type ShellRenderer, type MountWithRouterOptions, mountWithRouter } from './runtime.js';
import type { Router } from '../router/index.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ServerRenderResult<State> extends RenderWithRouterResult {
  head: string;
  state: State;
}

export interface CreateServerRendererOptions<State> {
  router: Router<State>;
  shell: ShellRenderer<State>;
  createState: (url: string, runtime: string) => State;
  titlePrefix?: string;
  defaultTitle?: string;
  detectRuntime?: () => string;
}

export function createServerRenderer<State>(options: CreateServerRendererOptions<State>) {
  return async (url: string): Promise<ServerRenderResult<State>> => {
    const runtime = options.detectRuntime?.() ?? detectRuntime();
    const state = options.createState(url, runtime);

    const rendered = renderWithRouter({
      router: options.router,
      url,
      state,
      shell: options.shell,
      titlePrefix: options.titlePrefix,
      defaultTitle: options.defaultTitle,
    });

    return {
      ...rendered,
      head: `<title>${escapeHtml(rendered.title)}</title>`,
      state,
    };
  };
}

export interface HydrateClientOptions<State> {
  router: Router<State>;
  shell: ShellRenderer<State>;
  stateKey?: string;
  rootSelector?: string;
  createFallbackState: () => State;
  titlePrefix?: string;
  defaultTitle?: string;
  getUrl?: MountWithRouterOptions<State>['getUrl'];
  setUrl?: MountWithRouterOptions<State>['setUrl'];
}

export function hydrateClient<State>(options: HydrateClientOptions<State>): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const root = document.querySelector(options.rootSelector ?? '#app');
  if (!root) {
    return () => {};
  }

  const stateKey = options.stateKey ?? '__STATE__';
  const win = window as unknown as Record<string, unknown>;
  const initialState = (win[stateKey] as State | undefined) ?? options.createFallbackState();

  return mountWithRouter({
    root,
    router: options.router,
    initialState,
    shell: options.shell,
    titlePrefix: options.titlePrefix,
    defaultTitle: options.defaultTitle,
    getUrl: options.getUrl,
    setUrl: options.setUrl,
  });
}
