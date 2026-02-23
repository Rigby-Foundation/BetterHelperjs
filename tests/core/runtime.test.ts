import { describe, expect, it } from 'vitest';

import { detectRuntime, isBrowser } from '../../src/core/runtime.js';

describe('runtime', () => {
  it('detects non-browser runtime in test environment', () => {
    expect(isBrowser).toBe(false);
    expect(['node', 'bun', 'deno', 'worker', 'unknown']).toContain(detectRuntime());
  });
});
