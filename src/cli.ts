#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import {
  type PackageManagerName,
  createInstallCommand,
  detectPackageManager,
  parsePackageManager,
  scaffoldProject,
} from './cli/scaffold.js';
import { prerenderSite, type PrerenderOptions } from './ssr/prerender.js';

interface CreateOptions {
  command: 'create';
  targetDirArg: string;
  force: boolean;
  install: boolean;
  packageManagerOverride?: string;
}

interface PrerenderCliOptions extends PrerenderOptions {
  command: 'prerender';
}

type CliOptions = CreateOptions | PrerenderCliOptions;

function printUsage(): void {
  console.log([
    'Karui CLI',
    '',
    'Usage:',
    '  karui create <project-name> [options]',
    '  karui prerender [options]',
    '',
    'create options:',
    '  --pm <npm|pnpm|yarn|bun>   package manager for install',
    '  --no-install               skip dependency install',
    '  --force                    allow non-empty target directory',
    '',
    'prerender options:',
    '  --out <dir>                output directory (default dist/static)',
    '  --root <dir>               project root (default cwd)',
    '  --path <url>               extra path to render (repeatable)',
    '  --not-found <url>          render this path to 404.html',
    '  --only-paths               render only --path entries, skip route discovery',
    '  --template <file>          html template (default index.html)',
    '  --app <module>             app entry (default /src/app.tsx)',
    '  --client-dist <dir>        client build dir (default dist/client)',
    '  --server-dist <dir>        server build dir (default dist/server)',
    '',
    '  -h, --help                 show help',
    '',
  ].join('\n'));
}

function expectValue(token: string, next: string | undefined): string {
  if (!next || next.startsWith('--')) {
    throw new Error(`Expected value after ${token}`);
  }
  return next;
}

function parseCreateArgs(targetDirArg: string | undefined, rest: string[]): CreateOptions | null {
  if (!targetDirArg || targetDirArg.startsWith('-')) {
    console.error('Missing <project-name>.');
    printUsage();
    process.exitCode = 1;
    return null;
  }

  const options: CreateOptions = {
    command: 'create',
    targetDirArg,
    force: false,
    install: true,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === '--force') {
      options.force = true;
      continue;
    }
    if (token === '--no-install') {
      options.install = false;
      continue;
    }
    if (token === '--pm') {
      options.packageManagerOverride = expectValue(token, rest[index + 1]);
      index += 1;
      continue;
    }
    if (token === '-h' || token === '--help') {
      printUsage();
      return null;
    }

    throw new Error(`Unknown option "${token}"`);
  }

  return options;
}

function parsePrerenderArgs(rest: string[]): PrerenderCliOptions | null {
  const options: PrerenderCliOptions = { command: 'prerender', paths: [] };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === '-h' || token === '--help') {
      printUsage();
      return null;
    }
    if (token === '--only-paths') {
      options.onlyExplicitPaths = true;
      continue;
    }

    const value = expectValue(token, rest[index + 1]);
    index += 1;

    switch (token) {
      case '--out': options.outDir = value; break;
      case '--root': options.root = value; break;
      case '--path': options.paths!.push(value); break;
      case '--not-found': options.notFoundPath = value; break;
      case '--template': options.templateFile = value; break;
      case '--app': options.appModulePath = value; break;
      case '--client-dist': options.clientDistDir = value; break;
      case '--server-dist': options.serverDistDir = value; break;
      default: throw new Error(`Unknown option "${token}"`);
    }
  }

  return options;
}

function parseArgs(argv: string[]): CliOptions | null {
  const [command, ...rest] = argv;

  if (!command || command === '-h' || command === '--help') {
    printUsage();
    return null;
  }

  if (command === 'create') {
    return parseCreateArgs(rest[0], rest.slice(1));
  }

  if (command === 'prerender') {
    return parsePrerenderArgs(rest);
  }

  console.error(`Unknown command "${command}".`);
  printUsage();
  process.exitCode = 1;
  return null;
}

async function resolveFrameworkVersion(): Promise<string> {
  try {
    const cliDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(cliDir, '../package.json');
    const raw = await readFile(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? 'latest';
  } catch {
    return 'latest';
  }
}

async function runInstall(targetDir: string, packageManager: PackageManagerName): Promise<void> {
  const command = createInstallCommand(packageManager);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.cmd, command.args, {
      cwd: targetDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command.cmd} exited with code ${String(code)}`));
    });
  });
}

function validateProjectDirName(input: string): string {
  const normalized = input.trim();
  if (!normalized) {
    throw new Error('Project name cannot be empty');
  }
  if (normalized === '.' || normalized === '..') {
    throw new Error('Use explicit project directory name');
  }
  if (/[<>:"|?*]/.test(normalized)) {
    throw new Error('Project name contains invalid characters');
  }
  return normalized;
}

async function runCreate(parsed: CreateOptions): Promise<void> {
  const projectDirName = validateProjectDirName(parsed.targetDirArg);
  const targetDir = path.resolve(process.cwd(), projectDirName);
  const projectName = path.basename(targetDir);

  const pmFromFlag = parsePackageManager(parsed.packageManagerOverride);
  if (parsed.packageManagerOverride && !pmFromFlag) {
    throw new Error(`Unsupported package manager "${parsed.packageManagerOverride}"`);
  }

  const packageManager: PackageManagerName = pmFromFlag ?? detectPackageManager();
  const frameworkVersion = await resolveFrameworkVersion();

  const written = await scaffoldProject({
    targetDir,
    projectName,
    frameworkVersion,
    force: parsed.force,
  });

  console.log(`Created ${written.length} files in ${targetDir}`);

  if (parsed.install) {
    console.log(`Installing dependencies with ${packageManager}...`);
    await runInstall(targetDir, packageManager);
  }

  const installLine = parsed.install ? '' : `  ${packageManager} install\n`;
  const runLine = packageManager === 'npm' ? 'npm run dev' : `${packageManager} run dev`;

  console.log([
    '',
    'Next steps:',
    `  cd ${projectDirName}`,
    installLine,
    `  ${runLine}`,
    '',
  ].join('\n'));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

async function runPrerender(parsed: PrerenderCliOptions): Promise<void> {
  const { command: _command, ...options } = parsed;

  console.log('Prerendering...');

  const pages = await prerenderSite({
    ...options,
    onProgress: (page) => {
      console.log(`  ${page.status}  ${page.path.padEnd(28)} → ${page.file}  ${formatBytes(page.bytes)}`);
    },
  });

  if (pages.length === 0) {
    console.log('No pages rendered. Add static routes, a page `staticPaths()` export, or pass --path.');
    return;
  }

  const total = pages.reduce((sum, page) => sum + page.bytes, 0);
  const outDir = options.outDir ?? 'dist/static';
  console.log(`\n${pages.length} page(s), ${formatBytes(total)} total → ${outDir}\n`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) return;

  if (parsed.command === 'create') {
    await runCreate(parsed);
    return;
  }

  await runPrerender(parsed);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[@rigbyhost/karui] ${message}`);
  process.exit(1);
});
