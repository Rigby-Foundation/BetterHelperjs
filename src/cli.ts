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

interface CliOptions {
  targetDirArg: string;
  force: boolean;
  install: boolean;
  packageManagerOverride?: string;
}

function printUsage(): void {
  console.log([
    'BetterHelperjs CLI',
    '',
    'Usage:',
    '  better-helperjs create <project-name> [options]',
    '',
    'Options:',
    '  --pm <npm|pnpm|yarn|bun>   package manager for install',
    '  --no-install                skip dependency install',
    '  --force                     allow non-empty target directory',
    '  -h, --help                  show help',
    '',
  ].join('\n'));
}

function parseArgs(argv: string[]): CliOptions | null {
  const [command, targetDirArg, ...rest] = argv;

  if (!command || command === '-h' || command === '--help') {
    printUsage();
    return null;
  }

  if (command !== 'create') {
    console.error(`Unknown command "${command}".`);
    printUsage();
    process.exitCode = 1;
    return null;
  }

  if (!targetDirArg || targetDirArg.startsWith('-')) {
    console.error('Missing <project-name>.');
    printUsage();
    process.exitCode = 1;
    return null;
  }

  let force = false;
  let install = true;
  let packageManagerOverride: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--force') {
      force = true;
      continue;
    }
    if (token === '--no-install') {
      install = false;
      continue;
    }
    if (token === '--pm') {
      const next = rest[index + 1];
      if (!next || next.startsWith('-')) {
        throw new Error('Expected value after --pm');
      }
      packageManagerOverride = next;
      index += 1;
      continue;
    }
    if (token === '-h' || token === '--help') {
      printUsage();
      return null;
    }

    throw new Error(`Unknown option "${token}"`);
  }

  return {
    targetDirArg,
    force,
    install,
    packageManagerOverride,
  };
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

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) return;

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

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[better-helperjs-cli] ${message}`);
  process.exit(1);
});
