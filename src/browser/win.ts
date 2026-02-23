import type { DomTools } from './dom.js';
import { assertBrowser, renderHtml } from './dom.js';

export interface ManagedWindow {
  id: string;
  name: string;
  langs: string | false;
  state: 'opened' | 'hidened';
  full: boolean;
  inRename: boolean;
  onUnfull: { top: number; left: number; width: number; height: number };
  elem: HTMLElement;
  drag: HTMLElement;
  content: HTMLElement;
  setTitle(newTitle: string): void;
  toggleFull(): void;
  close(): void;
  hide(): void;
  show(): void;
}

export type WindowAction = (window: ManagedWindow) => void;

export class WindowManager {
  public manager: HTMLElement | null = null;
  public hider: HTMLElement | null = null;

  public winAttrs = '';
  public dragAttrs = '';
  public titleAttrs = '';
  public renameAttrs = '';
  public btnAttrs = '';
  public hiderAttrs = '';

  public animOpen = '';
  public animClose = '';
  public animHide = '';
  public animShow = '';
  public animFullOn = '';
  public animFullOff = '';

  public readonly wins: Record<string, ManagedWindow> = {};
  public readonly defBtns: Array<[string, WindowAction]>;

  constructor(
    private readonly dom: DomTools,
    private readonly translate: (key: string) => string = (key) => key
  ) {
    this.defBtns = [
      ['\u2013', (win) => this.hide(win)],
      ['=', (win) => this.toggleFull(win)],
      ['X', (win) => this.close(win)],
    ];
  }

  public open(name: string, content = '', customAttrs = ''): ManagedWindow {
    assertBrowser();

    if (!this.manager || !this.hider) {
      throw new Error('Window manager and hider containers are not set');
    }

    const winId = this.createId();

    const base = {
      id: winId,
      name,
      langs: name as string | false,
      state: 'opened' as const,
      full: false,
      inRename: false,
      onUnfull: { top: 0, left: 0, width: 0, height: 0 },
    };

    const root = renderHtml(
      this.dom,
      `<div id="${winId}" ${this.winAttrs} ${customAttrs}>
        <div style="display:flex;justify-content:space-between;align-items:center" ${this.dragAttrs} id="DRAGGER${winId}">
          <span ${this.titleAttrs} id="title${winId}"${this.translateWindow(name)}</span>
          <div id="btns${winId}"></div>
        </div>
        <div id="content${winId}" style="overflow:auto;width:100%;height:100%">
          ${content.replace(/\{winId\}/g, winId)}
        </div>
      </div>`
    ) as HTMLElement;

    const btns = this.dom.q<HTMLDivElement>(`#btns${winId}`, root);
    if (!btns) throw new Error('Failed to create window buttons');

    for (const button of this.defBtns) {
      btns.append(this.createWindowButton(base.id, ...button));
    }

    root.style.overflow = 'hidden';
    root.style.resize = 'both';

    if (this.animOpen) {
      this.dom.on(root, 'animationend', () => root.classList.remove(this.animOpen), { once: true });
    }

    this.manager.append(root);

    const elem = this.dom.id(winId) as HTMLElement | null;
    const contentElement = this.dom.id(`content${winId}`) as HTMLElement | null;
    const drag = this.dom.id(`DRAGGER${winId}`) as HTMLElement | null;

    if (!elem || !contentElement || !drag) {
      throw new Error('Failed to initialize window structure');
    }

    const contentRect = contentElement.getBoundingClientRect();
    const rect = elem.getBoundingClientRect();
    const padX = rect.width - contentRect.width;
    const padY = rect.height - contentRect.height;

    const windowRecord: ManagedWindow = {
      ...base,
      elem,
      content: contentElement,
      drag,
      setTitle: (newTitle: string) => this.setTitle(windowRecord, newTitle),
      toggleFull: () => this.toggleFull(windowRecord),
      close: () => this.close(windowRecord),
      hide: () => this.hide(windowRecord),
      show: () => this.show(windowRecord),
    };

    this.wins[winId] = windowRecord;

    if (!customAttrs.includes('top')) {
      elem.style.top = `${elem.offsetTop - elem.offsetHeight / 2}px`;
      elem.style.left = `${elem.offsetLeft - elem.offsetWidth / 2}px`;
    }

    if (!customAttrs.includes('width')) elem.style.width = `${elem.offsetWidth - padX}px`;
    if (!customAttrs.includes('height')) elem.style.height = `${elem.offsetHeight - padY}px`;

    this.dom.on(windowRecord.drag, 'dblclick', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('button')) return;

      const title = this.dom.id(`title${winId}`);
      if (!title) return;

      if (!windowRecord.inRename) {
        title.innerHTML = `<input ${this.renameAttrs} id="rename${winId}" value="${title.textContent ?? ''}">`;
        windowRecord.inRename = true;
      } else {
        const renameInput = this.dom.id(`rename${winId}`) as HTMLInputElement | null;
        this.setTitle(windowRecord, renameInput?.value ?? windowRecord.name);
        windowRecord.inRename = false;
      }
    });

    this.initDrag(windowRecord);
    return windowRecord;
  }

  public setTitle(win: ManagedWindow, newTitle: string): void {
    win.langs = false;
    win.name = newTitle;

    const title = this.dom.id(`title${win.id}`);
    const hider = this.dom.id(`hider${win.id}`);

    if (title) {
      title.innerHTML = newTitle;
      title.removeAttribute('data-trans');
    }

    if (hider) {
      hider.innerHTML = newTitle;
      hider.removeAttribute('data-trans');
    }
  }

  public toggleFull(win: ManagedWindow): void {
    const winElement = win.elem;
    const styles = winElement.style;
    const classList = winElement.classList;
    const contentRect = this.dom.id(`content${win.id}`)?.getBoundingClientRect();
    const rect = winElement.getBoundingClientRect();

    if (!contentRect) return;

    const padX = rect.width - contentRect.width;
    const padY = rect.height - contentRect.height;
    const on = this.animFullOn;
    const off = this.animFullOff;

    const frame = {
      top: rect.top,
      left: rect.left,
      width: contentRect.width,
      height: contentRect.height,
    };

    const restore = (): void => {
      const old = win.onUnfull;
      styles.top = `${old.top}px`;
      styles.left = `${old.left}px`;
      styles.width = `${old.width}px`;
      styles.height = `${old.height}px`;
    };

    const goFull = (): void => {
      if (on) classList.remove(on);
      win.full = true;
      win.onUnfull = frame;

      styles.top = '0';
      styles.left = '0';
      styles.width = `calc(100% - ${padX}px)`;
      styles.height = `calc(100% - ${padY}px)`;

      win.drag.onmousedown = null;
      win.drag.ontouchstart = null;
    };

    const goWindowed = (): void => {
      if (off) classList.remove(off);
      restore();
      win.full = false;
      this.initDrag(win);
    };

    if (!win.full) {
      if (on) {
        classList.add(on);
        this.dom.on(winElement, 'animationend', goFull, { once: true });
      } else {
        goFull();
      }
      return;
    }

    if (off) {
      classList.add(off);
      restore();
      this.dom.on(winElement, 'animationend', goWindowed, { once: true });
    } else {
      goWindowed();
    }
  }

  public close(win: ManagedWindow): void {
    const element = win.elem;

    const removeWindow = (): void => {
      win.drag.onmousedown = null;
      win.drag.ontouchstart = null;
      element.remove();
      delete this.wins[win.id];
    };

    if (element.style.display === 'none') {
      this.dom.id(`hider${win.id}`)?.remove();
      removeWindow();
      return;
    }

    if (this.animClose) {
      element.classList.add(this.animClose);
      this.dom.on(element, 'animationend', removeWindow, { once: true });
      return;
    }

    removeWindow();
  }

  public hide(win: ManagedWindow): void {
    const element = win.elem;
    const classList = element.classList;

    const hideWindow = (): void => {
      element.style.display = 'none';
      if (this.animHide) classList.remove(this.animHide);
      win.state = 'hidened';
      this.hider?.append(this.createHiderButton(win));
    };

    if (this.animHide) {
      classList.add(this.animHide);
      this.dom.on(element, 'animationend', hideWindow, { once: true });
      return;
    }

    hideWindow();
  }

  public show(win: ManagedWindow): void {
    const element = win.elem;
    const classList = element.classList;
    const hider = this.dom.id(`hider${win.id}`);

    const showWindow = (): void => {
      if (this.animShow) classList.remove(this.animShow);
      win.state = 'opened';
    };

    element.style.display = '';
    hider?.remove();

    if (this.animShow) {
      classList.add(this.animShow);
      this.dom.on(element, 'animationend', showWindow, { once: true });
      return;
    }

    showWindow();
  }

  private createId(): string {
    let id: string;
    do {
      id = Math.random().toString(36).slice(2, 8);
    } while (this.wins[id]);

    return id;
  }

  private createWindowButton(windowId: string, text: string, action: WindowAction): HTMLButtonElement {
    const button = renderHtml(this.dom, `<button ${this.btnAttrs}>${text}</button>`) as HTMLButtonElement;

    this.dom.on(button, 'click', () => {
      const win = this.wins[windowId];
      if (win) action(win);
    });

    return button;
  }

  private createHiderButton(win: ManagedWindow): HTMLButtonElement {
    const title = win.langs !== false ? this.translateWindow(win.langs) : `>${win.name}<`;

    const button = renderHtml(
      this.dom,
      `<button id="hider${win.id}" ${this.hiderAttrs}${title}</button>`
    ) as HTMLButtonElement;

    this.dom.on(button, 'click', () => this.show(win));
    return button;
  }

  private initDrag(win: ManagedWindow): void {
    const element = win.elem;
    let x1 = 0;
    let y1 = 0;
    let x2 = 0;
    let y2 = 0;

    const stop = (): void => {
      this.dom.D.onmouseup = null;
      this.dom.D.ontouchend = null;
      this.dom.D.onmousemove = null;
      this.dom.D.ontouchmove = null;
    };

    const move = (event: MouseEvent | TouchEvent): void => {
      event.preventDefault();

      const clientX = 'touches' in event ? event.touches[0]?.clientX ?? x2 : event.clientX;
      const clientY = 'touches' in event ? event.touches[0]?.clientY ?? y2 : event.clientY;

      x1 = x2 - clientX;
      y1 = y2 - clientY;
      x2 = clientX;
      y2 = clientY;

      element.style.top = `${element.offsetTop - y1}px`;
      element.style.left = `${element.offsetLeft - x1}px`;
    };

    const start = (event: MouseEvent | TouchEvent): void => {
      const target = event.target as HTMLElement;
      if (['BUTTON', 'INPUT'].includes(target.tagName) || target.closest('button,input')) {
        return;
      }

      this.manager?.appendChild(element);

      event.preventDefault();
      x2 = 'touches' in event ? event.touches[0]?.clientX ?? 0 : event.clientX;
      y2 = 'touches' in event ? event.touches[0]?.clientY ?? 0 : event.clientY;

      this.dom.D.onmouseup = stop;
      this.dom.D.ontouchend = stop;
      this.dom.D.onmousemove = move as (this: GlobalEventHandlers, ev: MouseEvent) => unknown;
      this.dom.D.ontouchmove = move as (this: GlobalEventHandlers, ev: TouchEvent) => unknown;
    };

    win.drag.onmousedown = start as (this: GlobalEventHandlers, ev: MouseEvent) => unknown;
    win.drag.ontouchstart = start as (this: GlobalEventHandlers, ev: TouchEvent) => unknown;
  }

  private translateWindow(name: string): string {
    const key = `WINDOW-${name}`;
    const text = this.translate(key);

    if (text == null || text === '' || text === key) {
      return `>${name}<`;
    }

    return ` data-trans="${key}">${text}<`;
  }
}
