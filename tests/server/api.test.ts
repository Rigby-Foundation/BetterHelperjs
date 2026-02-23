import { describe, expect, it } from 'vitest';

import { resolveApiRequest } from '../../src/server/api.js';

describe('server api routes', () => {
  it('returns health payload', () => {
    const result = resolveApiRequest('GET', '/api/health');
    const data = JSON.parse(result.body) as { ok: boolean; service: string; runtime: string; now: string };

    expect(result.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.service).toBe('better-helperjs-api');
    expect(typeof data.runtime).toBe('string');
    expect(typeof data.now).toBe('string');
  });

  it('returns helper runtime/version', () => {
    const result = resolveApiRequest('GET', '/api/helper');
    const data = JSON.parse(result.body) as { version: string; runtime: string };

    expect(result.status).toBe(200);
    expect(data.version).toBe('3.0.0');
    expect(['node', 'bun', 'deno', 'worker', 'unknown']).toContain(data.runtime);
  });

  it('echoes JSON body', () => {
    const result = resolveApiRequest('POST', '/api/echo', JSON.stringify({ hello: 'world' }));
    const data = JSON.parse(result.body) as { ok: boolean; payload: { hello: string } };

    expect(result.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.payload.hello).toBe('world');
  });

  it('returns 404 for unknown route', () => {
    const result = resolveApiRequest('GET', '/api/unknown');

    expect(result.status).toBe(404);
    expect(result.body).toContain('Not found');
  });
});
