import type { DomTools } from './dom.js';
import { assertBrowser } from './dom.js';
import { warnDeprecated } from '../core/deprecated.js';

export class LazyLoader {
  public readonly loaded: Record<string, true | Promise<unknown>> = {};

  constructor(private readonly dom: DomTools) {}

  public load(url: string, ...args: unknown[]): Promise<unknown[]> {
    assertBrowser();

    const key = url.split('?')[0];
    const cached = this.loaded[key];

    if (cached === true) return Promise.resolve(args);
    if (cached instanceof Promise) return cached.then(() => args);

    const promise = new Promise<unknown[]>((resolve, reject) => {
      const script = this.dom.D.createElement('script');
      script.src = url;
      script.onload = () => {
        this.loaded[key] = true;
        resolve(args);
      };
      script.onerror = () => {
        delete this.loaded[key];
        reject(new Error(`Failed to load ${url}`));
      };
      this.dom.D.head.append(script);
    });

    this.loaded[key] = promise;
    return promise;
  }

  public register(script: string, funcs: string[]): void {
    assertBrowser();

    if (!Array.isArray(funcs)) {
      throw new Error('Array required for register');
    }

    for (const fn of funcs) {
      (globalThis as Record<string, unknown>)[fn] = (...args: unknown[]) =>
        this.resolve(script, fn).then((resolved) => resolved(...args));
    }

    console.info('lazy> Applied lazy', script, 'for:', funcs);
  }

  public async resolve(script: string, fn: string): Promise<(...args: unknown[]) => unknown> {
    const holder = globalThis as Record<string, unknown>;
    const wrapper = holder[fn];

    await this.load(script);

    if (wrapper !== holder[fn] && typeof holder[fn] === 'function') {
      return holder[fn] as (...args: unknown[]) => unknown;
    }

    throw new Error(`Function ${fn} not loaded from ${script}`);
  }

  /**
   * @deprecated Deprecated and will be removed in 3.2.0. Use `resolve()` instead.
   */
  public _(script: string, fn: string): Promise<(...args: unknown[]) => unknown> {
    warnDeprecated('lazy._');
    return this.resolve(script, fn);
  }
}
