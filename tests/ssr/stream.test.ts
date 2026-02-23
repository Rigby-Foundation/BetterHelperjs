import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { createHtmlChunkStream, streamToNodeResponse } from '../../src/ssr/stream.js';

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers = new Map<string, string>();
  chunks: string[] = [];
  ended = false;

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(chunk?: string): void {
    if (chunk) {
      this.chunks.push(chunk);
    }
    this.ended = true;
  }
}

describe('ssr stream helpers', () => {
  it('splits html into deterministic chunks', async () => {
    const output: string[] = [];

    for await (const chunk of createHtmlChunkStream('<main>abcdef</main>', { chunkSize: 5 })) {
      output.push(chunk);
    }

    expect(output).toEqual(['<main', '>abcd', 'ef</m', 'ain>']);
  });

  it('streams chunks to node-like response', async () => {
    const response = new MockResponse();

    await streamToNodeResponse(response, ['<html>', '<body>ok</body>', '</html>'], 201);

    expect(response.statusCode).toBe(201);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Transfer-Encoding')).toBe('chunked');
    expect(response.chunks.join('')).toBe('<html><body>ok</body></html>');
    expect(response.ended).toBe(true);
  });
});

