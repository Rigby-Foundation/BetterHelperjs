import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const bundleDir = path.resolve(process.cwd(), 'dist/vite');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

async function collectBundleFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const nested = await collectBundleFiles(fullPath);
      files.push(...nested);
      continue;
    }

    if (entry.name.endsWith('.map')) continue;
    files.push(fullPath);
  }

  return files;
}

async function main() {
  try {
    const targetStat = await stat(bundleDir);
    if (!targetStat.isDirectory()) {
      console.log('[bundle-size] dist/vite is not a directory, skipped.');
      return;
    }
  } catch {
    console.log('[bundle-size] dist/vite not found, skipped.');
    return;
  }

  const files = await collectBundleFiles(bundleDir);

  if (files.length === 0) {
    console.log('[bundle-size] no bundle files found in dist/vite.');
    return;
  }

  let totalRaw = 0;
  let totalGzip = 0;

  console.log('\nBundle size report (dist/vite):');

  for (const file of files.sort()) {
    const content = await readFile(file);
    const raw = content.byteLength;
    const gzip = gzipSync(content).byteLength;
    const relativePath = path.relative(bundleDir, file);

    totalRaw += raw;
    totalGzip += gzip;

    console.log(`- ${relativePath}: raw ${formatBytes(raw)} | gzip ${formatBytes(gzip)}`);
  }

  console.log(`Total: raw ${formatBytes(totalRaw)} | gzip ${formatBytes(totalGzip)}\n`);
}

main().catch((error) => {
  console.error('[bundle-size] failed:', error);
  process.exit(1);
});
