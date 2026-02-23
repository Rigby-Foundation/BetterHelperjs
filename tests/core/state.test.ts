import { describe, expect, it } from 'vitest';

import { createCounterRenderState, deserializeState, serializeState } from '../../src/core/state.js';

describe('core state utils', () => {
  it('creates counter render state', () => {
    const state = createCounterRenderState('/docs', 'node');

    expect(state.url).toBe('/docs');
    expect(state.runtime).toBe('node');
    expect(state.count).toBe(0);
    expect(typeof state.generatedAt).toBe('string');
  });

  it('serializes and deserializes safely', () => {
    const raw = serializeState({ text: '<script>' });
    const parsed = deserializeState(raw, { text: '' });

    expect(raw).toContain('\\u003cscript>');
    expect(parsed.text).toBe('<script>');
  });
});
