import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { syncBundles } from '../scripts/sync.mjs';

const sourceUrl = 'https://github.com/Miss-you/frontend-topics';
const names = [
  'author-search.js',
  'author-search.d.ts',
  'searchable-select.js',
  'date-navigation.js',
  'daily-ui.css',
  'verify.mjs',
  'LICENSE',
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'frontend-sync-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const sourceRoot = join(directory, 'source');
  const targetRoot = join(directory, 'reader');
  await fs.mkdir(join(sourceRoot, 'packages/daily-ui/src'), { recursive: true });
  await fs.writeFile(
    join(sourceRoot, 'packages/daily-ui/package.json'),
    JSON.stringify({ name: '@frontend-topics/daily-ui', version: '1.0.0' }),
  );
  for (const name of names)
    await fs.writeFile(
      join(sourceRoot, 'packages/daily-ui', name === 'LICENSE' ? name : `src/${name}`),
      `synthetic ${name}\n`,
    );
  await createTarget(targetRoot);
  return {
    directory,
    sourceRoot,
    targetRoot,
    destination: join(targetRoot, 'public/vendor/daily-ui'),
  };
}

async function createTarget(targetRoot, config = {}) {
  await fs.mkdir(targetRoot, { recursive: true });
  await fs.writeFile(
    join(targetRoot, 'frontend-vendor.json'),
    JSON.stringify({
      schemaVersion: 1,
      bundle: 'daily-ui',
      destination: 'public/vendor/daily-ui',
      source: sourceUrl,
      ...config,
    }),
  );
  await fs.writeFile(join(targetRoot, 'adapter.js'), 'consumer-specific behavior\n');
}

async function upgrade(sourceRoot, version = '1.1.0') {
  await fs.writeFile(
    join(sourceRoot, 'packages/daily-ui/package.json'),
    JSON.stringify({ name: '@frontend-topics/daily-ui', version }),
  );
  await fs.writeFile(join(sourceRoot, 'packages/daily-ui/src/author-search.js'), 'new matching\n');
}

const run = (f, mode, extra = {}) =>
  syncBundles({ sourceRoot: f.sourceRoot, targetRoots: [f.targetRoot], mode, ...extra });

async function snapshot(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const result = {};
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      result[entry.name] = entry.isDirectory()
        ? await snapshot(path)
        : await fs.readFile(path, 'utf8');
    }
    return result;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

test('default preview is read-only and check reports an absent vendor bundle', async (t) => {
  const f = await fixture(t);
  const before = await snapshot(f.targetRoot);
  const plan = await run(f, undefined);
  assert.equal(plan.mode, 'preview');
  assert.equal(plan.version, '1.0.0');
  assert.equal(plan.clean, false);
  assert.equal(plan.targets[0].files.length, names.length);
  assert.equal(
    plan.targets[0].files.every((file) => file.status === 'add'),
    true,
  );
  assert.deepEqual(await snapshot(f.targetRoot), before);
  assert.equal((await run(f, 'check')).clean, false);
  assert.deepEqual(await snapshot(f.targetRoot), before);
});

test('first write creates a versioned checksummed bundle and preserves consumer files', async (t) => {
  const f = await fixture(t);
  await run(f, 'write');
  assert.equal((await run(f, 'check')).clean, true);
  const manifest = JSON.parse(await fs.readFile(join(f.destination, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.files).sort(), [...names].sort());
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.source, sourceUrl);
  for (const name of names)
    assert.equal(manifest.files[name], digest(await fs.readFile(join(f.destination, name))));
  assert.equal(
    await fs.readFile(join(f.targetRoot, 'adapter.js'), 'utf8'),
    'consumer-specific behavior\n',
  );
  const before = await snapshot(f.targetRoot);
  await run(f, 'write');
  assert.deepEqual(await snapshot(f.targetRoot), before);
});

test('an explicit version upgrade updates only managed bundle files', async (t) => {
  const f = await fixture(t);
  await run(f, 'write');
  await upgrade(f.sourceRoot);
  assert.equal((await run(f, 'check')).clean, false);
  await run(f, 'write', { expectedVersion: '1.1.0' });
  assert.equal((await run(f, 'check')).clean, true);
  assert.equal(
    await fs.readFile(join(f.destination, 'author-search.js'), 'utf8'),
    'new matching\n',
  );
  assert.equal(
    await fs.readFile(join(f.targetRoot, 'adapter.js'), 'utf8'),
    'consumer-specific behavior\n',
  );
});

for (const mutation of ['edit', 'delete'])
  test(`write refuses a locally ${mutation === 'edit' ? 'edited' : 'deleted'} managed file`, async (t) => {
    const f = await fixture(t);
    await run(f, 'write');
    const path = join(f.destination, 'daily-ui.css');
    if (mutation === 'edit') await fs.writeFile(path, 'local override\n');
    else await fs.unlink(path);
    await upgrade(f.sourceRoot);
    const before = await snapshot(f.targetRoot);
    assert.equal((await run(f, 'check')).clean, false);
    await assert.rejects(run(f, 'write'), /local|modified|missing|conflict/i);
    assert.deepEqual(await snapshot(f.targetRoot), before);
  });

test('unknown vendor files and nonempty directories without ownership metadata are refused', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(f.destination, { recursive: true });
  await fs.writeFile(join(f.destination, 'daily-ui.css'), 'unmanaged\n');
  await assert.rejects(run(f, 'write'), /manifest|unmanaged|ownership/i);
  await fs.rm(f.destination, { recursive: true });
  await run(f, 'write');
  await fs.writeFile(join(f.destination, 'notes.txt'), 'consumer note\n');
  const before = await snapshot(f.targetRoot);
  await assert.rejects(run(f, 'write'), /unknown|unmanaged|unexpected/i);
  assert.deepEqual(await snapshot(f.targetRoot), before);
});

test('same-version source changes require a version bump before writing', async (t) => {
  const f = await fixture(t);
  await run(f, 'write');
  await fs.writeFile(join(f.sourceRoot, 'packages/daily-ui/src/daily-ui.css'), 'changed release\n');
  const before = await snapshot(f.targetRoot);
  assert.equal((await run(f, 'check')).clean, false);
  await assert.rejects(run(f, 'write'), /version.*bump|bump.*version|same.version/i);
  assert.deepEqual(await snapshot(f.targetRoot), before);
});

test('wrong source version and an invalid source package are refused before mutation', async (t) => {
  const f = await fixture(t);
  const before = await snapshot(f.targetRoot);
  await assert.rejects(run(f, 'write', { expectedVersion: '9.0.0' }), /version/i);
  await fs.writeFile(
    join(f.sourceRoot, 'packages/daily-ui/package.json'),
    JSON.stringify({ name: 'different-bundle', version: '1.0.0' }),
  );
  await assert.rejects(run(f, 'write'), /package|bundle/i);
  assert.deepEqual(await snapshot(f.targetRoot), before);
});

for (const config of [
  { schemaVersion: 2 },
  { bundle: 'another-bundle' },
  { source: 'https://example.invalid/another-source' },
  { destination: '../escape' },
  { destination: '/absolute' },
  { destination: 'src/business-code' },
])
  test(`invalid opt-in config is refused: ${JSON.stringify(config)}`, async (t) => {
    const f = await fixture(t);
    await createTarget(f.targetRoot, config);
    const before = await snapshot(f.targetRoot);
    await assert.rejects(run(f, 'write'), /config|source|destination|schema|bundle/i);
    assert.deepEqual(await snapshot(f.targetRoot), before);
  });

test('a project without opt-in configuration is not modified', async (t) => {
  const f = await fixture(t);
  await fs.unlink(join(f.targetRoot, 'frontend-vendor.json'));
  const before = await snapshot(f.targetRoot);
  await assert.rejects(run(f, 'write'), /frontend-vendor|config|opt.in/i);
  assert.deepEqual(await snapshot(f.targetRoot), before);
});

for (const location of ['root', 'parent', 'destination', 'config', 'source'])
  test(`symlink at ${location} is rejected`, async (t) => {
    const f = await fixture(t);
    const outside = join(f.directory, 'outside');
    await fs.mkdir(outside);
    if (location === 'root') {
      const alias = join(f.directory, 'reader-alias');
      await fs.symlink(f.targetRoot, alias);
      f.targetRoot = alias;
    } else if (location === 'parent') {
      await fs.symlink(outside, join(f.targetRoot, 'public'));
    } else if (location === 'destination') {
      await fs.mkdir(join(f.targetRoot, 'public/vendor'), { recursive: true });
      await fs.symlink(outside, f.destination);
    } else if (location === 'config') {
      await fs.rename(join(f.targetRoot, 'frontend-vendor.json'), join(outside, 'config.json'));
      await fs.symlink(join(outside, 'config.json'), join(f.targetRoot, 'frontend-vendor.json'));
    } else {
      await fs.unlink(join(f.sourceRoot, 'packages/daily-ui/src/daily-ui.css'));
      await fs.writeFile(join(outside, 'style.css'), 'outside content\n');
      await fs.symlink(
        join(outside, 'style.css'),
        join(f.sourceRoot, 'packages/daily-ui/src/daily-ui.css'),
      );
    }
    const before = await snapshot(outside);
    await assert.rejects(run(f, 'write'), /symlink/i);
    assert.deepEqual(await snapshot(outside), before);
  });

test('a target overlapping the source is refused', async (t) => {
  const f = await fixture(t);
  await createTarget(f.sourceRoot);
  await assert.rejects(run(f, 'write', { targetRoots: [f.sourceRoot] }), /overlap|source/i);
});

test('a later target validation failure leaves every earlier target untouched', async (t) => {
  const f = await fixture(t);
  const second = join(f.directory, 'second-reader');
  await createTarget(second);
  await syncBundles({
    sourceRoot: f.sourceRoot,
    targetRoots: [f.targetRoot, second],
    mode: 'write',
  });
  await fs.writeFile(join(second, 'public/vendor/daily-ui/daily-ui.css'), 'local edit\n');
  await upgrade(f.sourceRoot);
  const before = await snapshot(f.targetRoot);
  await assert.rejects(run(f, 'write', { targetRoots: [f.targetRoot, second] }), /local|conflict/i);
  assert.deepEqual(await snapshot(f.targetRoot), before);
});

test('a rename failure rolls back bundles already replaced in the same write', async (t) => {
  const f = await fixture(t);
  const second = join(f.directory, 'second-reader');
  await createTarget(second);
  const options = { sourceRoot: f.sourceRoot, targetRoots: [f.targetRoot, second], mode: 'write' };
  await syncBundles(options);
  await upgrade(f.sourceRoot);
  const firstBefore = await snapshot(f.targetRoot);
  const secondBefore = await snapshot(second);
  const rename = fs.rename;
  const secondDestination = join(await fs.realpath(second), 'public/vendor/daily-ui');
  let injected = false;
  fs.rename = async (from, to) => {
    if (!injected && from.includes('.stage-') && to === secondDestination) {
      injected = true;
      throw new Error('synthetic rename failure');
    }
    return rename(from, to);
  };
  try {
    await assert.rejects(syncBundles(options), /synthetic rename failure/);
  } finally {
    fs.rename = rename;
  }
  assert.equal(injected, true);
  assert.deepEqual(await snapshot(f.targetRoot), firstBefore);
  assert.deepEqual(await snapshot(second), secondBefore);
});

test('CLI defaults to preview, check fails on drift, and write/check honors an expected version', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(join(f.sourceRoot, 'scripts'));
  await fs.copyFile(
    new URL('../scripts/sync.mjs', import.meta.url),
    join(f.sourceRoot, 'scripts/sync.mjs'),
  );
  const cli = (args = []) =>
    spawnSync(
      process.execPath,
      [join(f.sourceRoot, 'scripts/sync.mjs'), '--target', f.targetRoot, ...args],
      { encoding: 'utf8' },
    );
  const preview = cli();
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).mode, 'preview');
  assert.equal(await snapshot(f.destination), null);
  assert.equal(cli(['--check']).status, 1);
  assert.equal(cli(['--write', '--version', '9.0.0']).status, 1);
  assert.equal(await snapshot(f.destination), null);
  const write = cli(['--write', '--version', '1.0.0']);
  assert.equal(write.status, 0, write.stderr);
  assert.equal(cli(['--check']).status, 0);
  assert.match(cli(['--unknown']).stderr, /Unknown argument/);
  assert.match(cli(['--check', '--write']).stderr, /one sync mode/);
});

test('consumer edits made while staging are detected before any bundle is replaced', async (t) => {
  const f = await fixture(t);
  const second = join(f.directory, 'second-reader');
  await createTarget(second);
  const options = { sourceRoot: f.sourceRoot, targetRoots: [f.targetRoot, second], mode: 'write' };
  await syncBundles(options);
  await upgrade(f.sourceRoot);
  const firstBefore = await snapshot(f.targetRoot);
  const secondCss = join(second, 'public/vendor/daily-ui/daily-ui.css');
  const writeFile = fs.writeFile;
  let injected = false;
  fs.writeFile = async (path, ...args) => {
    if (!injected && String(path).includes('.stage-')) {
      injected = true;
      await writeFile(secondCss, 'concurrent consumer edit\n');
    }
    return writeFile(path, ...args);
  };
  try {
    await assert.rejects(syncBundles(options), /changed|modified|conflict/i);
  } finally {
    fs.writeFile = writeFile;
  }
  assert.equal(injected, true);
  assert.deepEqual(await snapshot(f.targetRoot), firstBefore);
  assert.equal(await fs.readFile(secondCss, 'utf8'), 'concurrent consumer edit\n');
});
