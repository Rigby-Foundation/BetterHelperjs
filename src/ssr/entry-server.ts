import { createHelper } from '../index.js';
import { createCounterRenderState } from '../core/state.js';
import { renderApp, type AppRenderResult } from './app.js';
import { type SsrAppState } from './view.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface SsrRenderResult {
  html: string;
  head: string;
  status: number;
  state: SsrAppState;
}

export async function render(url: string): Promise<SsrRenderResult> {
  const helper = createHelper({
    bindErrors: false,
    enableBrowserModules: false,
  });

  const state: SsrAppState = createCounterRenderState(url, helper.runtime);

  const rendered: AppRenderResult = renderApp(state);

  return {
    html: rendered.html,
    head: `<title>${escapeHtml(rendered.title)}</title>`,
    status: rendered.status,
    state,
  };
}
