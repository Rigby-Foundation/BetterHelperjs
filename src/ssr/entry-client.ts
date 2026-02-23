import { mountApp } from './app.js';
import { type SsrAppState } from './view.js';

declare global {
  interface Window {
    __BH_STATE__?: SsrAppState;
  }
}

const state = window.__BH_STATE__ ?? {
  url: `${location.pathname}${location.search}`,
  runtime: 'browser',
  generatedAt: new Date().toISOString(),
  count: 0,
};

const root = document.getElementById('app');
if (root) {
  mountApp(root, state);
}
