import { describe, expect, it } from 'vitest';

import { render } from '../../src/ssr/entry-server.js';

describe('ssr entry-server', () => {
  it('returns html/head/state/status for url', async () => {
    const result = await render('/docs/getting-started');

    expect(result.head).toContain('<title>BetterHelper SSR - Docs</title>');
    expect(result.status).toBe(200);
    expect(result.html).toContain('BetterHelper SSR + JSX Router');
    expect(result.state.url).toBe('/docs/getting-started');
    expect(typeof result.state.runtime).toBe('string');
  });
});
