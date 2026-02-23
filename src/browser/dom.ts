import { isBrowser } from '../core/runtime.js';

export interface DomTools {
  D: Document;
  id(id: string): HTMLElement | null;
  q<T extends Element = Element>(selector: string, parent?: ParentNode): T | null;
  qa<T extends Element = Element>(selector: string, parent?: ParentNode): NodeListOf<T>;
  on(target: EventTarget, event: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): void;
  off(target: EventTarget, event: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions): void;
}

export function assertBrowser(message = 'Browser environment is required'): void {
  if (!isBrowser) {
    throw new Error(message);
  }
}

export function createDomTools(doc: Document = document): DomTools {
  assertBrowser();

  return {
    D: doc,
    id: (id: string) => doc.getElementById(id),
    q: <T extends Element = Element>(selector: string, parent: ParentNode = doc) => parent.querySelector<T>(selector),
    qa: <T extends Element = Element>(selector: string, parent: ParentNode = doc) => parent.querySelectorAll<T>(selector),
    on: (target, event, listener, options) => target.addEventListener(event, listener, options),
    off: (target, event, listener, options) => target.removeEventListener(event, listener, options),
  };
}

export function renderHtml(dom: DomTools, markup: string): DocumentFragment | ChildNode {
  const template = dom.D.createElement('template');
  template.innerHTML = markup.trim().replace(/\s+/g, ' ');

  const content = template.content;
  if (content.children.length === 1) {
    return content.firstChild as ChildNode;
  }

  return content;
}

export function html(dom: DomTools, strings: TemplateStringsArray, ...args: Array<string | number | Node>): DocumentFragment | ChildNode {
  const parts: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    parts.push(strings[i], String(args[i]));
  }

  parts.push(strings[strings.length - 1]);

  return renderHtml(dom, parts.join(''));
}
