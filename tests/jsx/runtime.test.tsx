// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { mount, renderToString } from '../../src/jsx/index.js';

describe('jsx runtime', () => {
  it('renders jsx tree to html string', () => {
    const html = renderToString(
      <section className="box" style={{ backgroundColor: 'red', padding: '4px' }} data-test>
        <h1>Title</h1>
        <p>{'<unsafe>'}</p>
      </section>
    );

    expect(html).toContain('<section');
    expect(html).toContain('class="box"');
    expect(html).toContain('data-test');
    expect(html).toContain('&lt;unsafe&gt;');
  });

  it('mounts jsx into dom and wires events', () => {
    const root = document.createElement('div');
    document.body.append(root);

    const onClick = vi.fn();
    mount(root, <button id="btn" onClick={onClick}>click</button>);

    root.querySelector<HTMLButtonElement>('#btn')?.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
