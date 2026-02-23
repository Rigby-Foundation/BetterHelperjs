import type { HttpClient } from './http.js';
import { warnDeprecated } from './deprecated.js';

export type LangVariables = Record<string, string | number | boolean | null | undefined>;
export type LangDictionary = Record<string, string>;

interface DomQueryRoot {
  querySelectorAll(selector: string): Iterable<Element>;
}

export class LanguageService {
  public addr = '';
  public vars: LangVariables = {};
  public main: LangDictionary = {};

  constructor(private readonly http: HttpClient) {}

  public attr(index: string): string {
    return ` data-trans="${index}"`;
  }

  /**
   * @deprecated Deprecated and will be removed in 3.2.0. Use `attr()` instead.
   */
  public _(index: string): string {
    warnDeprecated('lang._');
    return this.attr(index);
  }

  public async load(name: string): Promise<string> {
    return this.http.req('GET', `${this.addr}${name}.json`, '', {
      'Cache-Control': 'no-cache,no-store,max-age=0',
    });
  }

  public parse(packet: string, vars: LangVariables = this.vars): string {
    return packet.replace(/\+([^+]+)\+/g, (match, key: string) => {
      const value = vars[key];
      return value !== undefined ? String(value) : match;
    });
  }

  public async replace(name: string, root?: DomQueryRoot): Promise<string> {
    const packet = await this.load(name);
    this.main = JSON.parse(this.parse(packet));

    if (!root) return packet;

    for (const element of root.querySelectorAll('[data-trans]')) {
      const htmlElement = element as HTMLElement;
      const key = htmlElement.dataset.trans;
      if (!key) continue;

      const text = this.main[key] ?? `<code>lang.from('${key}')</code>`;
      const tag = htmlElement.tagName;

      if (tag === 'IMG') {
        (htmlElement as HTMLImageElement).src = text;
      } else if (tag === 'INPUT' || tag === 'TEXTAREA') {
        const input = htmlElement as HTMLInputElement | HTMLTextAreaElement;
        if (tag === 'INPUT' && (input as HTMLInputElement).type === 'submit') {
          (input as HTMLInputElement).value = text;
        } else {
          input.placeholder = text;
        }
      } else {
        htmlElement.innerHTML = text;
      }
    }

    return packet;
  }

  public from(index: string): string {
    const value = this.main[index];
    if (value === undefined) {
      console.warn(`lang> ${index} is undefined`);
      return index;
    }

    return value;
  }

  public text(index: string): string {
    return `${this.attr(index)}>${this.from(index)}<`;
  }

  public submit(index: string): string {
    return `${this.attr(index)}value="${this.from(index)}">`;
  }

  public input(index: string): string {
    return `${this.attr(index)}placeholder="${this.from(index)}">`;
  }

  public textarea(index: string): string {
    return `${this.attr(index)}placeholder="${this.from(index)}"><`;
  }

  public img(index: string): string {
    return `${this.attr(index)}src="${this.from(index)}"`;
  }

  public win(index: string): string {
    let text = this.from(index);
    let dataTrans = this.attr(index);

    if (text == null || text === '') {
      text = index;
      dataTrans = '';
    }

    return `${dataTrans}>${text}<`;
  }
}
