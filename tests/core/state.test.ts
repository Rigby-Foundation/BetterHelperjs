import { describe, expect, it } from 'vitest';

import {
  createCounterRenderState,
  createRenderState,
  deserializeState,
  serializeState,
} from '../../src/core/state.js';

describe('core state utils', () => {
  it('creates render state from url and runtime', () => {
    const state = createRenderState('/docs', 'node');

    expect(state.url).toBe('/docs');
    expect(state.runtime).toBe('node');
    expect(typeof state.generatedAt).toBe('string');
  });

  it('carries no app-specific fields', () => {
    // `count` was demo residue; framework state is url/runtime/generatedAt only.
    expect(Object.keys(createRenderState('/', 'node')).sort()).toEqual([
      'generatedAt',
      'runtime',
      'url',
    ]);
  });

  it('serializes and deserializes safely', () => {
    const raw = serializeState({ text: '<script>' });
    const parsed = deserializeState(raw, { text: '' });

    expect(raw).toContain('\\u003cscript>');
    expect(parsed.text).toBe('<script>');
  });

  it('falls back when the payload is not valid JSON', () => {
    expect(deserializeState('{oops', { text: 'fallback' })).toEqual({ text: 'fallback' });
  });

  it('keeps the deprecated counter state working', () => {
    const state = createCounterRenderState('/docs', 'node');

    expect(state.count).toBe(0);
    expect(state.url).toBe('/docs');
    expect(createCounterRenderState('/', 'node', 5).count).toBe(5);
  });
});
