import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = [
  'author-search.js',
  'author-search.d.ts',
  'searchable-select.js',
  'date-navigation.js',
  'daily-ui.css',
  'verify.mjs',
  'LICENSE',
];

/** Verify an installed bundle against its committed ownership manifest without reading another checkout. */
export async function verifyBundle(directory = dirname(fileURLToPath(import.meta.url))) {
  const root = resolve(directory);
  if (!(await fs.lstat(root)).isDirectory() || (await fs.lstat(root)).isSymbolicLink())
    throw new Error('Bundle must be a regular directory');
  const manifestPath = join(root, 'manifest.json');
  if ((await fs.lstat(manifestPath)).isSymbolicLink())
    throw new Error('Manifest must not be a symlink');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.bundle !== 'daily-ui' ||
    manifest.source !== 'https://github.com/Miss-you/frontend-topics' ||
    typeof manifest.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(manifest.version) ||
    !manifest.files ||
    Object.keys(manifest.files).sort().join('\0') !== [...FILES].sort().join('\0')
  )
    throw new Error('Invalid bundle ownership manifest');
  const actualNames = (await fs.readdir(root)).sort();
  if (actualNames.join('\0') !== [...FILES, 'manifest.json'].sort().join('\0'))
    throw new Error('Bundle has missing or unmanaged files');
  for (const file of FILES) {
    const path = join(root, file);
    const info = await fs.lstat(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error(`Managed file is not regular: ${file}`);
    const hash = createHash('sha256')
      .update(await fs.readFile(path))
      .digest('hex');
    if (hash !== manifest.files[file]) throw new Error(`Vendor drift: ${file}`);
  }
  return { bundle: 'daily-ui', version: manifest.version, files: FILES.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await verifyBundle()));
  } catch (error) {
    console.error(`[daily-ui] ${error.message}`);
    process.exitCode = 1;
  }
}
