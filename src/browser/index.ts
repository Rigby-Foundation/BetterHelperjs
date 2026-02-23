import {
  assertBrowser,
  createDomTools,
  html as domHtml,
  renderHtml as domRenderHtml,
} from './dom.js';
import { Hotkeys } from './hotkeys.js';
import { LazyLoader } from './lazy.js';
import { LinkManager } from './link.js';
import { WindowManager } from './win.js';

export * from './dom.js';
export * from './link.js';
export * from './lazy.js';
export * from './hotkeys.js';
export * from './win.js';

export interface BrowserModules {
  readonly dom: ReturnType<typeof createDomTools>;
  readonly link: LinkManager;
  readonly lazy: LazyLoader;
  readonly hotkeys: Hotkeys;
  readonly win: WindowManager;
  readonly html: (strings: TemplateStringsArray, ...args: Array<string | number | Node>) => DocumentFragment | ChildNode;
  readonly renderHtml: (markup: string) => DocumentFragment | ChildNode;
}

export function createBrowserModules(translate: (key: string) => string = (key) => key): BrowserModules {
  assertBrowser();

  const dom = createDomTools();

  return {
    dom,
    link: new LinkManager(dom),
    lazy: new LazyLoader(dom),
    hotkeys: new Hotkeys(dom),
    win: new WindowManager(dom, translate),
    html: (strings, ...args) => domHtml(dom, strings, ...args),
    renderHtml: (markup) => domRenderHtml(dom, markup),
  };
}
