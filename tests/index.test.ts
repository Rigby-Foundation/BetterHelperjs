import { describe, expect, it } from 'vitest';

import * as karui from '../src/index.js';

describe('root entry', () => {
  it('exports the framework surface', () => {
    for (const name of ['mount', 'hydrate', 'unmount', 'renderToString', 'useState', 'createRouter', 'Link', 'redirect', 'notFound', 'createSite', 'defineSite', 'defineIsland']) {
      expect(karui, `missing export: ${name}`).toHaveProperty(name);
    }
  });

  it('no longer leaks the legacy toolkit into the main entry', () => {
    // Moved to @rigbyhost/karui/legacy in 5.0 so `.` stays side-effect free.
    for (const name of ['helper', '_', 'createHelper', 'mountGlobal', 'WindowManager', 'Hotkeys', 'LazyLoader', 'LinkManager', 'LanguageService', 'HttpClient']) {
      expect(karui, `unexpected export: ${name}`).not.toHaveProperty(name);
    }
  });

  it('has no default export, so importing it does nothing', () => {
    expect(karui).not.toHaveProperty('default');
  });
});
