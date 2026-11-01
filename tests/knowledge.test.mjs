import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'test-results', 'playwright-report'].includes(entry.name))
      continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

test('knowledge Markdown links resolve to local files or directories', async () => {
  const missing = [];
  for (const file of await markdownFiles(root)) {
    const content = await readFile(file, 'utf8');
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
      const path = resolve(dirname(file), decodeURIComponent(target));
      try {
        await access(path);
      } catch {
        missing.push({ document: file.slice(root.length + 1), target });
      }
    }
  }
  assert.deepEqual(missing, []);
});
