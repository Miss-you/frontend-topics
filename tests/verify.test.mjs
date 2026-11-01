import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, cp, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyBundle } from '../packages/daily-ui/src/verify.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'daily-ui-verify-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(new URL('../packages/daily-ui/src/', import.meta.url), root, { recursive: true });
  await cp(new URL('../packages/daily-ui/LICENSE', import.meta.url), join(root, 'LICENSE'));
  const files = {};
  for (const file of await readdir(root))
    files[file] = createHash('sha256')
      .update(await readFile(join(root, file)))
      .digest('hex');
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      bundle: 'daily-ui',
      version: '1.0.0',
      source: 'https://github.com/Miss-you/frontend-topics',
      files,
    }),
  );
  return root;
}

test('an installed bundle verifies without its source checkout', async (t) => {
  assert.deepEqual(await verifyBundle(await fixture(t)), {
    bundle: 'daily-ui',
    version: '1.0.0',
    files: 7,
  });
});
for (const mutation of ['edit', 'delete', 'unknown', 'symlink', 'manifest']) {
  test(`standalone drift check rejects ${mutation}`, async (t) => {
    const root = await fixture(t);
    const file = join(root, 'author-search.js');
    if (mutation === 'edit') await writeFile(file, 'changed');
    if (mutation === 'delete') await rm(file);
    if (mutation === 'unknown') await writeFile(join(root, 'custom.js'), 'custom');
    if (mutation === 'symlink') {
      await rm(file);
      await symlink(join(root, 'daily-ui.css'), file);
    }
    if (mutation === 'manifest')
      await writeFile(join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 2 }));
    await assert.rejects(verifyBundle(root));
  });
}
