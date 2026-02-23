// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { createDomTools } from '../../src/browser/dom.js';
import { LazyLoader } from '../../src/browser/lazy.js';

describe('LazyLoader', () => {
  it('registers wrapper and resolves via legacy alias _', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const dom = createDomTools(document);
    const lazy = new LazyLoader(dom);

    const resolveSpy = vi.spyOn(lazy, 'resolve').mockResolvedValue((value: number) => value + 1);

    lazy.register('/fake.js', ['legacyLazy']);

    const result = await (globalThis as Record<string, (value: number) => Promise<number>>).legacyLazy(1);
    const fn = await lazy._('/fake.js', 'legacyLazy');

    expect(result).toBe(2);
    expect(resolveSpy).toHaveBeenCalledWith('/fake.js', 'legacyLazy');
    expect(typeof fn).toBe('function');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Deprecated] lazy._'));
    expect(infoSpy).toHaveBeenCalled();
  });
});
