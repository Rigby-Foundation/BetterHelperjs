import { createBrowserModules, type BrowserModules } from './browser/index.js';
import { bindGlobalErrorHandlers, ErrorCenter } from './core/errors.js';
import { HttpClient } from './core/http.js';
import { LanguageService } from './core/lang.js';
import { detectRuntime, isBrowser, type RuntimeName } from './core/runtime.js';
import { NamespaceStorage, type StorageLike } from './core/storage.js';
import { createNamespaceStorage } from './core/storage.js';

export * from './core/index.js';
export * from './browser/index.js';
export * from './router/index.js';
export * from './router/file-based.js';
export * from './jsx/index.js';
export * from './ssr/index.js';

export interface CreateHelperOptions {
  version?: string;
  enableBrowserModules?: boolean;
  bindErrors?: boolean;
  storage?: StorageLike;
}

export interface HelperFramework {
  ver: string;
  runtime: RuntimeName;
  http: HttpClient;
  lang: LanguageService;
  err: ErrorCenter;
  storage: typeof NamespaceStorage;
  createStorage(namespace: string, storage?: StorageLike): NamespaceStorage;
  browser?: BrowserModules;
  $?: BrowserModules['dom'];
  html?: BrowserModules['html'];
  renderHtml?: BrowserModules['renderHtml'];
  link?: BrowserModules['link'];
  lazy?: BrowserModules['lazy'];
  hotkeys?: BrowserModules['hotkeys'];
  win?: BrowserModules['win'];
  wins: BrowserModules['win']['wins'];
  initBrowser(): BrowserModules;
}

export function createHelper(options: CreateHelperOptions = {}): HelperFramework {
  const http = new HttpClient();
  const lang = new LanguageService(http);
  const err = new ErrorCenter();

  if (options.bindErrors !== false) {
    bindGlobalErrorHandlers(err);
  }

  const helper: HelperFramework = {
    ver: options.version ?? '3.0.0',
    runtime: detectRuntime(),
    http,
    lang,
    err,
    storage: NamespaceStorage,
    createStorage: (namespace: string, storage?: StorageLike) => createNamespaceStorage(namespace, storage ?? options.storage),
    wins: {},
    initBrowser: () => {
      if (!isBrowser) {
        throw new Error('Browser modules are only available in browser runtime');
      }

      if (helper.browser) {
        return helper.browser;
      }

      const browser = createBrowserModules((key) => lang.from(key));
      helper.browser = browser;
      helper.$ = browser.dom;
      helper.html = browser.html;
      helper.renderHtml = browser.renderHtml;
      helper.link = browser.link;
      helper.lazy = browser.lazy;
      helper.hotkeys = browser.hotkeys;
      helper.win = browser.win;
      helper.wins = browser.win.wins;

      browser.dom.on(window, 'popstate', () => {
        browser.link.handlePopState();
      });

      return browser;
    },
  };

  if (options.enableBrowserModules !== false && isBrowser) {
    helper.initBrowser();
  }

  return helper;
}

export const helper = createHelper();
export const _ = helper;

export function mountGlobal(target: Record<string, unknown> = globalThis as Record<string, unknown>): HelperFramework {
  target._ = helper as unknown;
  return helper;
}

export default helper;
