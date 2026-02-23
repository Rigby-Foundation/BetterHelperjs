import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpClient } from '../../src/core/http.js';

describe('HttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends request using fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const http = new HttpClient();
    const response = await http.req('GET', 'https://example.com');

    expect(response).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('fail', { status: 500, statusText: 'Server Error' }));
    vi.stubGlobal('fetch', fetchMock);

    const http = new HttpClient();

    await expect(http.req('GET', 'https://example.com')).rejects.toThrow('500 - Server Error');
  });
});
