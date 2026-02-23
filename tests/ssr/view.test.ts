import { describe, expect, it } from 'vitest';

import { renderApp } from '../../src/ssr/app.js';
import { serializeState } from '../../src/ssr/view.js';

describe('ssr app view', () => {
  it('renders docs route through router', () => {
    const rendered = renderApp({
      url: '/docs/getting-started?tab=api',
      runtime: 'node',
      generatedAt: '2026-02-23T00:00:00.000Z',
      count: 2,
    });

    expect(rendered.status).toBe(200);
    expect(rendered.title).toContain('Docs');
    expect(rendered.html).toContain('slug: <code>getting-started</code>');
    expect(rendered.html).toContain('Count: <span id="count-value">2</span>');
  });

  it('returns 404 route for unknown page', () => {
    const rendered = renderApp({
      url: '/missing-page',
      runtime: 'node',
      generatedAt: '2026-02-23T00:00:00.000Z',
      count: 0,
    });

    expect(rendered.status).toBe(404);
    expect(rendered.title).toContain('404');
    expect(rendered.html).toContain('No route for <code>/missing-page</code>');
  });

  it('serializes state safely', () => {
    const payload = serializeState({
      url: '/x',
      runtime: 'node',
      generatedAt: '2026-02-23T00:00:00.000Z',
      count: 0,
    });

    expect(payload).toContain('"runtime":"node"');
    expect(payload).not.toContain('</script>');
  });
});
