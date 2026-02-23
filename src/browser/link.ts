import type { DomTools } from './dom.js';
import { assertBrowser } from './dom.js';
import { warnDeprecated } from '../core/deprecated.js';

export type LinkHandler = (value?: string) => void;
export interface LinkMap {
  [key: string]: LinkHandler | LinkMap;
}

export class LinkManager {
  public basePage: () => void = () => {};
  public defTitle = '';
  public actions: LinkMap = {};
  public commands: Record<string, LinkHandler> = {};
  public readonly cmd: string[] = [];

  private firstTransition = true;

  constructor(private readonly dom: DomTools) {}

  /**
   * @deprecated Deprecated and will be removed in 3.2.0. Use `cmd` instead.
   */
  public get _cmd(): string[] {
    warnDeprecated('link._cmd');
    return this.cmd;
  }

  /**
   * @deprecated Deprecated and will be removed in 3.2.0. Use `cmd` instead.
   */
  public set _cmd(next: string[]) {
    warnDeprecated('link._cmd');
    this.cmd.length = 0;
    this.cmd.push(...next);
  }

  /**
   * @deprecated Deprecated and will be removed in 3.2.0. Internal transition flag.
   */
  public get _i(): boolean {
    warnDeprecated('link._i');
    return this.firstTransition;
  }

  /**
   * @deprecated Deprecated and will be removed in 3.2.0. Internal transition flag.
   */
  public set _i(next: boolean) {
    warnDeprecated('link._i');
    this.firstTransition = next;
  }

  public compile(): string[] {
    assertBrowser();

    const search = location.search.replace('?', '');
    return search.length ? search.split('&') : [''];
  }

  public set(page: string, title = this.defTitle): void {
    assertBrowser();

    if (title) this.dom.D.title = title;

    if (!this.firstTransition) {
      const link = this.compile();
      link[0] = page;
      history.pushState(null, '', `?${link.join('&')}`);
    }

    this.firstTransition = false;
  }

  public add(command: string): void {
    assertBrowser();

    const link = this.compile();

    if (!link.includes(command)) {
      link.push(command);
      this.cmd.push(command);
      history.replaceState(null, '', `?${link.join('&')}`);
    }
  }

  public remove(command: string): void {
    assertBrowser();

    const link = this.compile();

    if (!link.includes(command)) return;

    const commandIndex = link.indexOf(command);
    if (commandIndex >= 0) link.splice(commandIndex, 1);

    const localIndex = this.cmd.indexOf(command);
    if (localIndex >= 0) this.cmd.splice(localIndex, 1);

    history.replaceState(null, '', `?${link.join('&')}`);
  }

  public get(): void {
    assertBrowser();

    const links = this.compile();
    const [first = ''] = links;
    const [fKey, fVal] = first.split('=');
    const commands = links.slice(1);

    try {
      this.resolveAction(fKey, fVal);
    } catch (error) {
      this.basePage();
      throw error;
    }

    this.cmd.length = 0;
    this.cmd.push(...commands);

    for (const commandPair of commands) {
      const [key, value] = commandPair.split('=');
      const command = this.commands[key];
      if (command) command(value);
    }
  }

  public handlePopState(): void {
    assertBrowser();

    if (!this.firstTransition) {
      const newUrl = `?${[this.compile()[0], ...this.cmd].join('&')}`;
      history.replaceState(null, '', newUrl);
      this.firstTransition = true;
      this.get();
      return;
    }

    this.firstTransition = false;
  }

  private resolveAction(firstKey: string, value?: string): void {
    if (!firstKey) {
      this.basePage();
      return;
    }

    if (!firstKey.includes('/')) {
      const target = this.actions[firstKey];
      if (typeof target === 'function') {
        target(value);
        return;
      }

      throw new Error(`Action ${firstKey} is not registered`);
    }

    let directory: LinkMap = this.actions;
    const dirs = firstKey.split('/');

    for (const part of dirs) {
      const nested = directory[`${part}/`];

      if (nested && typeof nested !== 'function') {
        directory = nested;
        continue;
      }

      const leaf = directory[part];
      if (typeof leaf === 'function') {
        leaf(value);
        return;
      }

      throw new Error(`Action ${firstKey} is not registered`);
    }
  }
}
