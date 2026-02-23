// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { renderToString, mount } from '../../src/jsx/index.js';
import { createRouter, Link } from '../../src/router/index.js';

describe('router Link', () => {
  it('renders anchor with router marker attribute', () => {
    const html = renderToString(<Link href="/about" className="nav-link">about</Link>);

    expect(html).toContain('<a');
    expect(html).toContain('href="/about"');
    expect(html).toContain('data-link');
    expect(html).toContain('class="nav-link"');
  });

  it('navigates without full reload when clicked', () => {
    history.replaceState(null, '', '/');

    const router = createRouter([
      { path: '/', title: 'home', component: () => null },
      { path: '/about', title: 'about', component: () => null },
    ]);

    const received: string[] = [];
    const stop = router.start((url) => {
      received.push(url);
    });

    const root = document.createElement('div');
    document.body.append(root);
    mount(root, <Link href="/about">About</Link>);

    const link = root.querySelector('a');
    link?.click();
    stop();

    expect(window.location.pathname).toBe('/about');
    expect(received).toContain('/about');
  });
});
