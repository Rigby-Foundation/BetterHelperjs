// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { createDomTools } from '../../src/browser/dom.js';
import { LinkManager } from '../../src/browser/link.js';

describe('LinkManager', () => {
  it('resolves action and command from query', () => {
    const dom = createDomTools(document);
    const link = new LinkManager(dom);
    const action = vi.fn();
    const command = vi.fn();

    link.actions.home = action;
    link.commands.cmd = command;

    history.replaceState(null, '', '?home=1&cmd=on');
    link.get();

    expect(action).toHaveBeenCalledWith('1');
    expect(command).toHaveBeenCalledWith('on');
  });

  it('supports deprecated aliases _cmd/_i', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dom = createDomTools(document);
    const link = new LinkManager(dom);

    link._cmd = ['a=1'];
    link._i = false;

    expect(link._cmd).toEqual(['a=1']);
    expect(link._i).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Deprecated] link._cmd'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Deprecated] link._i'));
  });
});
