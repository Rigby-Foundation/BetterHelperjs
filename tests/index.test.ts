import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

describe('exports map', () => {
  async function readPackageJson(): Promise<Record<string, unknown>> {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return JSON.parse(await readFile(path.resolve(here, '../package.json'), 'utf8'));
  }

  it('exposes ./package.json so tooling can read the version', async () => {
    const pkg = await readPackageJson();
    const exports = pkg.exports as Record<string, unknown>;

    // A plain string target resolves under every condition, so both
    // `import` and `require` reach it. Build tooling needs this.
    expect(exports['./package.json']).toBe('./package.json');
  });

  it('ships every export target', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = await readPackageJson();
    const exports = pkg.exports as Record<string, string | Record<string, string>>;

    for (const [subpath, target] of Object.entries(exports)) {
      const file = typeof target === 'string' ? target : target.import;
      // dist/ is only present after a build; skip when it is not.
      const absolute = path.resolve(here, '..', file);
      if (file.startsWith('./dist/')) continue;
      await expect(readFile(absolute, 'utf8'), `${subpath} -> ${file}`).resolves.toBeTruthy();
    }
  });
});
