import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createInstallCommand,
  createTemplateFiles,
  detectPackageManager,
  parsePackageManager,
  scaffoldProject,
} from '../../src/cli/scaffold.js';

describe('cli scaffold', () => {
  it('creates default template files', () => {
    const files = createTemplateFiles({
      projectName: 'my-app',
      frameworkVersion: '3.0.2',
    });

    expect(Object.keys(files)).toContain('package.json');
    expect(Object.keys(files)).toContain('src/app.tsx');
    expect(Object.keys(files)).toContain('src/pages/docs/[slug].tsx');
    expect(files['package.json']).toContain('"better-helperjs": "^3.0.2"');
  });

  it('writes scaffold to target directory', async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'bhjs-cli-'));
    const targetDir = path.join(tmpRoot, 'demo');

    const written = await scaffoldProject({
      targetDir,
      projectName: 'demo',
      frameworkVersion: '3.0.2',
    });

    expect(written.length).toBeGreaterThan(5);
    const srcEntries = await readdir(path.join(targetDir, 'src'));
    expect(srcEntries).toContain('app.tsx');
    expect(srcEntries).toContain('layout.tsx');

    const pkgJson = await readFile(path.join(targetDir, 'package.json'), 'utf8');
    expect(pkgJson).toContain('"name": "demo"');
    expect(pkgJson).toContain('"dev": "tsx server.ts"');
  });

  it('parses package manager flags', () => {
    expect(parsePackageManager('npm')).toBe('npm');
    expect(parsePackageManager('bun')).toBe('bun');
    expect(parsePackageManager('unknown')).toBeNull();
  });

  it('detects package manager from user agent', () => {
    expect(detectPackageManager('pnpm/10.0.0 node/v24')).toBe('pnpm');
    expect(detectPackageManager('yarn/4.0.0 npm/? node/v24')).toBe('yarn');
    expect(detectPackageManager('bun/1.2.0')).toBe('bun');
    expect(detectPackageManager('npm/11.0.0 node/v24')).toBe('npm');
  });

  it('creates install command by package manager', () => {
    expect(createInstallCommand('npm')).toEqual({ cmd: 'npm', args: ['install'] });
    expect(createInstallCommand('pnpm')).toEqual({ cmd: 'pnpm', args: ['install'] });
    expect(createInstallCommand('yarn')).toEqual({ cmd: 'yarn', args: ['install'] });
    expect(createInstallCommand('bun')).toEqual({ cmd: 'bun', args: ['install'] });
  });
});

