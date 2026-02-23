import type { DomTools } from './dom.js';
import { assertBrowser } from './dom.js';

export interface HotkeyBinding {
  keys: string[];
  press: (event?: KeyboardEvent) => void;
  release: (event?: KeyboardEvent) => void;
  active: boolean;
}

export class Hotkeys {
  public readonly keys: Record<string, HotkeyBinding> = {};
  private readonly holds = new Set<string>();
  private initialized = false;

  constructor(private readonly dom: DomTools) {}

  public on(combo: string, press?: (event?: KeyboardEvent) => void, release?: (event?: KeyboardEvent) => void): this {
    assertBrowser();
    this.init();

    this.keys[combo] = {
      keys: this.parse(combo),
      press: press ?? (() => {}),
      release: release ?? (() => {}),
      active: false,
    };

    return this;
  }

  public off(combo: string): this {
    delete this.keys[combo];
    return this;
  }

  private parse(combo: string): string[] {
    return combo.split('+').map((key) => key.trim());
  }

  private match(keys: string[]): boolean {
    for (const key of keys) {
      if (!this.holds.has(key)) return false;
    }

    return true;
  }

  private init(): void {
    if (this.initialized) return;

    this.dom.on(this.dom.D, 'keydown', (event) => {
      const keyboard = event as KeyboardEvent;
      this.holds.add(keyboard.code);

      for (const combo in this.keys) {
        const hotkey = this.keys[combo];
        if (!this.match(hotkey.keys)) continue;

        if (hotkey.press && !hotkey.active) {
          hotkey.active = true;
          hotkey.press(keyboard);
        }
      }
    });

    this.dom.on(this.dom.D, 'keyup', (event) => {
      const keyboard = event as KeyboardEvent;
      this.holds.delete(keyboard.code);

      for (const combo in this.keys) {
        const hotkey = this.keys[combo];
        if (hotkey.active && !this.match(hotkey.keys)) {
          hotkey.active = false;
          hotkey.release(keyboard);
        }
      }
    });

    this.dom.on(window, 'blur', () => {
      for (const combo in this.keys) {
        const hotkey = this.keys[combo];
        if (hotkey.active) {
          hotkey.active = false;
          hotkey.release();
        }
      }

      this.holds.clear();
    });

    this.initialized = true;
  }
}
