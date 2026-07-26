import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { build } from 'vite';

const root = process.cwd();
const bundleDir = path.resolve(root, 'dist/vite');

// Gzip budgets in bytes. CI fails when an entry exceeds its budget, so the
// numbers quoted in README.md cannot silently drift again.
// Raise deliberately, in the same commit that grows the bundle.
const BUDGETS = {
  '@rigbyhost/karui': 15_000,
  '@rigbyhost/karui/jsx': 6_000,
  '@rigbyhost/karui/router': 3_500,
  '@rigbyhost/karui/ssr': 12_500,
  'jsx + router': 8_800,
  '@rigbyhost/karui/legacy': 8_000,
};

// The number worth quoting publicly: what a normal client app actually pulls in.
const HEADLINE_ENTRY = 'jsx + router';

const ENTRIES = [
  { name: '@rigbyhost/karui', note: 'jsx + router + ssr', input: 'src/index.ts' },
  { name: '@rigbyhost/karui/jsx', note: 'JSX runtime + hooks + reconciler', input: 'src/jsx/index.ts' },
  { name: '@rigbyhost/karui/router', note: 'router + Link', input: 'src/router/index.ts' },
  { name: '@rigbyhost/karui/ssr', note: 'SSR, islands, streaming', input: 'src/ssr/index.ts' },
  { name: 'jsx + router', note: 'typical client app', combine: ['src/jsx/index.ts', 'src/router/index.ts'] },
  { name: '@rigbyhost/karui/legacy', note: 'inherited newHelper-js toolkit', input: 'src/legacy/index.ts' },
];

const jsxRuntimeAlias = {
  '@rigbyhost/karui/jsx-runtime': path.resolve(root, 'src/jsx/jsx-runtime.ts'),
  '@rigbyhost/karui/jsx-dev-runtime': path.resolve(root, 'src/jsx/jsx-dev-runtime.ts'),
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function measure(source) {
  const buffer = Buffer.from(source);

  return {
    raw: buffer.byteLength,
    gzip: gzipSync(buffer, { level: 9 }).byteLength,
    brotli: brotliCompressSync(buffer, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  };
}

function pad(value, width) {
  return String(value).padEnd(width);
}

function padStart(value, width) {
  return String(value).padStart(width);
}

function printTable(rows) {
  const nameWidth = Math.max(...rows.map((row) => row.name.length));
  const noteWidth = Math.max(...rows.map((row) => (row.note ?? '').length));

  for (const row of rows) {
    const note = noteWidth > 0 ? `  ${pad(row.note ?? '', noteWidth)}` : '';
    console.log(
      `  ${pad(row.name, nameWidth)}${note}  ` +
      `min ${padStart(formatBytes(row.raw), 8)}  ` +
      `gzip ${padStart(formatBytes(row.gzip), 8)}  ` +
      `br ${padStart(formatBytes(row.brotli), 8)}`
    );
  }
}

// Virtual entry support, so we can measure combinations that have no real file.
// Vite resolves build.lib.entry against root before rollup sees it, so match on
// the suffix rather than the bare id.
function virtualEntryPlugin(id, code) {
  const resolved = `\0${id}`;

  return {
    name: 'karui-virtual-entry',
    resolveId: (source) => (source === id || source.endsWith(id) ? resolved : null),
    load: (source) => (source === resolved ? code : null),
  };
}

async function bundleEntry(entry) {
  const virtualId = 'virtual:karui-entry';
  // Absolute specifiers: a virtual module has no directory to resolve against.
  const virtualCode = entry.combine
    ?.map((file) => `export * from ${JSON.stringify(path.resolve(root, file))};`)
    .join('\n');
  const input = virtualCode ? path.resolve(root, virtualId) : path.resolve(root, entry.input);

  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: virtualCode ? [virtualEntryPlugin(virtualId, virtualCode)] : [],
    resolve: { alias: jsxRuntimeAlias },
    esbuild: { jsx: 'automatic', jsxImportSource: '@rigbyhost/karui' },
    build: {
      write: false,
      minify: 'esbuild',
      target: 'es2020',
      lib: { entry: input, formats: ['es'], fileName: 'entry' },
      rollupOptions: { external: ['vite', /^node:/] },
    },
  });

  const outputs = Array.isArray(result) ? result : [result];
  const code = outputs
    .flatMap((bundle) => bundle.output)
    .filter((chunk) => chunk.type === 'chunk')
    .map((chunk) => chunk.code)
    .join('');

  return { ...entry, ...measure(code) };
}

async function collectBundleFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectBundleFiles(fullPath)));
      continue;
    }

    if (entry.name.endsWith('.map')) continue;
    files.push(fullPath);
  }

  return files;
}

async function reportDistributedBundles() {
  try {
    const targetStat = await stat(bundleDir);
    if (!targetStat.isDirectory()) return;
  } catch {
    console.log('Distributed bundles: dist/vite not found, run `npm run build:vite` first.\n');
    return;
  }

  const files = (await collectBundleFiles(bundleDir)).sort();
  if (files.length === 0) return;

  const rows = [];
  for (const file of files) {
    const content = await readFile(file);
    rows.push({ name: path.relative(bundleDir, file), note: '', ...measure(content) });
  }

  console.log('Distributed bundles (dist/vite/)');
  printTable(rows);
  console.log('  ^ one library in three module formats — alternatives, not additive.\n');
}

async function main() {
  console.log('\nKarui bundle size\n');

  await reportDistributedBundles();

  console.log('Per-entry cost (minified ESM, tree-shaken)');
  const rows = [];
  for (const entry of ENTRIES) {
    rows.push(await bundleEntry(entry));
  }
  printTable(rows);

  const headline = rows.find((row) => row.name === HEADLINE_ENTRY);
  if (headline) {
    console.log(
      `\nHeadline (${HEADLINE_ENTRY}): ${formatBytes(headline.raw)} minified, ` +
      `${formatBytes(headline.gzip)} gzipped, ${formatBytes(headline.brotli)} brotli.`
    );
  }

  const failures = [];
  console.log('\nBudgets (gzip)');
  for (const row of rows) {
    const budget = BUDGETS[row.name];
    if (budget === undefined) continue;

    const over = row.gzip > budget;
    if (over) failures.push({ name: row.name, gzip: row.gzip, budget });

    const percent = Math.round((row.gzip / budget) * 100);
    console.log(
      `  ${pad(row.name, 24)} ${padStart(formatBytes(row.gzip), 8)} / ${padStart(formatBytes(budget), 8)}  ` +
      `${padStart(`${percent}%`, 5)}  ${over ? 'OVER BUDGET' : 'ok'}`
    );
  }

  console.log('');

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `[bundle-size] ${failure.name} is ${formatBytes(failure.gzip - failure.budget)} over its ` +
        `${formatBytes(failure.budget)} gzip budget.`
      );
    }
    console.error('[bundle-size] Shrink the bundle, or raise the budget in scripts/bundle-size.mjs deliberately.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[bundle-size] failed:', error);
  process.exit(1);
});
