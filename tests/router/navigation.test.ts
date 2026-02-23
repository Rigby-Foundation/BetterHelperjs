// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createRouter } from '../../src/router/index.js';

describe('router navigation', () => {
  it('navigates and notifies listeners in browser mode', () => {
    history.replaceState(null, '', '/');

    const router = createRouter([
      { path: '/', title: 'home', component: () => null },
      { path: '/about', title: 'about', component: () => null },
    ]);

    const received: string[] = [];
    const stop = router.start((url) => {
      received.push(url);
    });

    router.navigate('/about');

    stop();

    expect(window.location.pathname).toBe('/about');
    expect(received).toContain('/about');
  });
});
