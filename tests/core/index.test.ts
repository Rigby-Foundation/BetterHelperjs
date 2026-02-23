import { describe, expect, it } from 'vitest';

import { createHelper } from '../../src/index.js';

describe('createHelper', () => {
  it('creates helper without browser modules in non-browser runtime', () => {
    const helper = createHelper({ enableBrowserModules: false, bindErrors: false });

    expect(helper.http).toBeDefined();
    expect(helper.lang).toBeDefined();
    expect(helper.wins).toEqual({});
    expect(helper.browser).toBeUndefined();
  });
});
