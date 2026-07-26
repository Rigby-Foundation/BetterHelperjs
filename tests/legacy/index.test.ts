import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createHelper, VERSION } from '../../src/legacy/index.js';

describe('legacy helper', () => {
  it('creates helper without browser modules in non-browser runtime', () => {
    const helper = createHelper({ enableBrowserModules: false, bindErrors: false });

    expect(helper.http).toBeDefined();
    expect(helper.lang).toBeDefined();
    expect(helper.wins).toEqual({});
    expect(helper.browser).toBeUndefined();
  });

  it('reports the package version', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const raw = await readFile(path.resolve(here, '../../package.json'), 'utf8');
    const { version } = JSON.parse(raw) as { version: string };

    // The literal in src/legacy/index.ts has no build-time source of truth,
    // so pin it here rather than let it drift like the old '4.0.1' did.
    expect(VERSION).toBe(version);
    expect(createHelper({ enableBrowserModules: false, bindErrors: false }).ver).toBe(version);
  });
});
