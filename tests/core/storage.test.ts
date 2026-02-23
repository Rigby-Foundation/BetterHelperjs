import { describe, expect, it } from 'vitest';

import { MemoryStorage, createNamespaceStorage } from '../../src/core/storage.js';

describe('NamespaceStorage', () => {
  it('reads and writes values inside namespace', () => {
    const raw = new MemoryStorage();
    const storage = createNamespaceStorage('app:', raw);

    storage.set('token', 'abc');

    expect(storage.get('token')).toBe('abc');
    expect(raw.getItem('app:token')).toBe('abc');
  });

  it('clears only namespaced keys', () => {
    const raw = new MemoryStorage();
    raw.setItem('app:one', '1');
    raw.setItem('other:one', '1');

    const storage = createNamespaceStorage('app:', raw);
    storage.clear();

    expect(raw.getItem('app:one')).toBeNull();
    expect(raw.getItem('other:one')).toBe('1');
  });
});
