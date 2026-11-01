import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://github.com/Miss-you/frontend-topics';
const DESTINATION = 'public/vendor/daily-ui';
const FILES = [
  'author-search.js',
  'author-search.d.ts',
  'searchable-select.js',
  'date-navigation.js',
  'daily-ui.css',
  'verify.mjs',
  'LICENSE',
];
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

async function statOrNull(path) {
  try {
    return await fs.lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function safeRoot(path, label) {
  if (typeof path !== 'string' || !path) throw new Error(`${label} root is required`);
  const fullPath = resolve(path);
  const info = await statOrNull(fullPath);
  if (info?.isSymbolicLink()) throw new Error(`${label} root must not be a symlink`);
  if (!info?.isDirectory()) throw new Error(`${label} root must be an existing directory`);
  return fs.realpath(fullPath);
}

function contained(root, path) {
  const rel = relative(root, path);
  return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}

async function safePath(root, path) {
  const fullPath = resolve(root, path);
  if (!contained(root, fullPath)) throw new Error('Unsafe path escapes its configured root');
  const parts = relative(root, fullPath).split(sep);
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    const info = await statOrNull(current);
    if (!info) return fullPath;
    if (info.isSymbolicLink()) throw new Error(`Refusing symlink: ${relative(root, current)}`);
    if (index < parts.length - 1 && !info.isDirectory())
      throw new Error(`Non-directory ancestor: ${relative(root, current)}`);
  }
  return fullPath;
}

async function safeFile(root, path) {
  const fullPath = await safePath(root, path);
  if (!(await statOrNull(fullPath))?.isFile()) throw new Error(`Missing regular file: ${path}`);
  return fs.readFile(fullPath);
}

function parseObject(bytes, label) {
  try {
    const result = JSON.parse(bytes.toString('utf8'));
    if (!object(result)) throw new Error('Not an object');
    return result;
  } catch {
    throw new Error(`Invalid ${label} JSON object`);
  }
}

function exactKeys(value, expected) {
  return Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

async function readSource(sourceRoot, expectedVersion) {
  const root = await safeRoot(sourceRoot, 'Source');
  const metadata = parseObject(
    await safeFile(root, 'packages/daily-ui/package.json'),
    'source package',
  );
  if (
    metadata.name !== '@frontend-topics/daily-ui' ||
    typeof metadata.version !== 'string' ||
    !VERSION.test(metadata.version)
  )
    throw new Error('Invalid daily-ui source package name or version');
  if (expectedVersion !== undefined && metadata.version !== expectedVersion)
    throw new Error(
      `Source version ${metadata.version} does not match expected version ${expectedVersion}`,
    );
  const bytes = new Map();
  const hashes = {};
  for (const name of FILES) {
    const path = `packages/daily-ui/${name === 'LICENSE' ? name : `src/${name}`}`;
    const content = await safeFile(root, path);
    bytes.set(name, content);
    hashes[name] = digest(content);
  }
  const manifest = {
    schemaVersion: 1,
    bundle: 'daily-ui',
    version: metadata.version,
    source: SOURCE,
    files: hashes,
  };
  return {
    root,
    version: metadata.version,
    bytes,
    manifest,
    manifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  };
}

function validateConfig(config) {
  if (
    !exactKeys(config, ['schemaVersion', 'bundle', 'destination', 'source']) ||
    config.schemaVersion !== 1 ||
    config.bundle !== 'daily-ui' ||
    config.destination !== DESTINATION ||
    config.source !== SOURCE
  )
    throw new Error(
      'Invalid frontend-vendor config: schema, bundle, destination or source does not match',
    );
}

function validateManifest(manifest) {
  if (
    !exactKeys(manifest, ['schemaVersion', 'bundle', 'version', 'source', 'files']) ||
    manifest.schemaVersion !== 1 ||
    manifest.bundle !== 'daily-ui' ||
    manifest.source !== SOURCE ||
    typeof manifest.version !== 'string' ||
    !VERSION.test(manifest.version) ||
    !object(manifest.files) ||
    !exactKeys(manifest.files, FILES) ||
    Object.values(manifest.files).some(
      (hash) => typeof hash !== 'string' || !/^[\da-f]{64}$/.test(hash),
    )
  )
    throw new Error('Invalid vendor manifest ownership metadata');
}

async function planTarget(source, targetRoot) {
  const root = await safeRoot(targetRoot, 'Target');
  if (root === source.root || contained(source.root, root) || contained(root, source.root))
    throw new Error('Target must not overlap the source repository');
  const config = parseObject(
    await safeFile(root, 'frontend-vendor.json'),
    'frontend-vendor config',
  );
  validateConfig(config);
  const destination = await safePath(root, config.destination);
  const info = await statOrNull(destination);
  if (info && !info.isDirectory()) throw new Error('Vendor destination must be a directory');
  const entries = info ? await fs.readdir(destination) : [];
  const unknown = entries.filter((entry) => entry !== 'manifest.json' && !FILES.includes(entry));
  if (unknown.length) throw new Error(`Unknown unmanaged vendor files: ${unknown.join(', ')}`);
  let oldManifest = null;
  let oldManifestBytes = null;
  if (entries.includes('manifest.json')) {
    oldManifestBytes = await safeFile(root, `${config.destination}/manifest.json`);
    oldManifest = parseObject(oldManifestBytes, 'vendor manifest');
    validateManifest(oldManifest);
  } else if (entries.length) throw new Error('Nonempty unmanaged vendor directory has no manifest');
  const files = [];
  const actualHashes = {};
  const conflicts = [];
  for (const name of FILES) {
    const path = await safePath(root, `${config.destination}/${name}`);
    const fileInfo = await statOrNull(path);
    if (fileInfo && !fileInfo.isFile())
      throw new Error(`Managed vendor file is not regular: ${name}`);
    const actual = fileInfo ? await fs.readFile(path) : null;
    actualHashes[name] = actual ? digest(actual) : null;
    if (oldManifest && (!actual || digest(actual) !== oldManifest.files[name]))
      conflicts.push(`${name}: locally modified or missing managed file`);
    files.push({
      file: name,
      status: !actual ? 'add' : actual.equals(source.bytes.get(name)) ? 'unchanged' : 'update',
    });
  }
  if (
    oldManifest?.version === source.version &&
    FILES.some((name) => oldManifest.files[name] !== source.manifest.files[name])
  )
    conflicts.push(
      'Source changed under the same version; bump the package version before writing',
    );
  const manifestStatus = !oldManifestBytes
    ? 'add'
    : oldManifestBytes.equals(source.manifestBytes)
      ? 'unchanged'
      : 'update';
  return {
    root,
    destination,
    exists: Boolean(info),
    fingerprint: digest(
      JSON.stringify({
        exists: Boolean(info),
        manifest: oldManifestBytes ? digest(oldManifestBytes) : null,
        files: actualHashes,
      }),
    ),
    report: {
      targetRoot: root,
      destination: config.destination,
      version: source.version,
      files,
      manifestStatus,
      conflicts,
    },
    clean:
      conflicts.length === 0 &&
      manifestStatus === 'unchanged' &&
      files.every((file) => file.status === 'unchanged'),
  };
}

async function createParents(root, parent, created) {
  let current = root;
  for (const segment of relative(root, parent).split(sep)) {
    current = join(current, segment);
    if (!(await statOrNull(current))) {
      await fs.mkdir(current);
      created.push(current);
    }
    await safePath(root, relative(root, current));
  }
}

async function writePlans(source, plans) {
  const changed = plans.filter((plan) => !plan.clean);
  const prepared = [];
  const created = [];
  try {
    for (const plan of changed) {
      const parent = dirname(plan.destination);
      await createParents(plan.root, parent, created);
      const id = randomUUID();
      const stage = join(parent, `.daily-ui.stage-${id}`);
      const backup = join(parent, `.daily-ui.backup-${id}`);
      await fs.mkdir(stage);
      const item = { plan, stage, backup, backedUp: false, installed: false };
      prepared.push(item);
      for (const [name, bytes] of source.bytes) await fs.writeFile(join(stage, name), bytes);
      await fs.writeFile(join(stage, 'manifest.json'), source.manifestBytes);
    }
    for (const item of prepared) {
      const current = await planTarget(source, item.plan.root);
      if (current.fingerprint !== item.plan.fingerprint)
        throw new Error('Consumer bundle changed while staging; sync conflict, retry after review');
    }
    for (const item of prepared) {
      await safePath(item.plan.root, DESTINATION);
      if (item.plan.exists) {
        await fs.rename(item.plan.destination, item.backup);
        item.backedUp = true;
      }
      await fs.rename(item.stage, item.plan.destination);
      item.installed = true;
    }
  } catch (error) {
    const failures = [error];
    for (const item of [...prepared].reverse()) {
      try {
        if (item.installed) await fs.rm(item.plan.destination, { recursive: true });
        if (item.backedUp) await fs.rename(item.backup, item.plan.destination);
      } catch (rollbackError) {
        failures.push(rollbackError);
      }
    }
    for (const item of prepared) await fs.rm(item.stage, { recursive: true, force: true });
    for (const path of [...created].reverse()) {
      try {
        await fs.rmdir(path);
      } catch (cleanupError) {
        if (!['ENOENT', 'ENOTEMPTY'].includes(cleanupError.code)) failures.push(cleanupError);
      }
    }
    if (failures.length > 1)
      throw new AggregateError(failures, 'Sync failed and rollback needs inspection');
    throw error;
  }
  const warnings = [];
  for (const item of prepared) {
    if (item.backedUp) {
      try {
        await fs.rm(item.backup, { recursive: true });
      } catch {
        warnings.push(
          'A completed sync backup could not be removed; inspect the vendor parent directory',
        );
      }
    }
  }
  return warnings;
}

/** Preview, check or atomically vendor a pinned bundle; writes reject drift and validate all targets first. */
export async function syncBundles({ sourceRoot, targetRoots, mode = 'preview', expectedVersion }) {
  if (!['preview', 'check', 'write'].includes(mode)) throw new Error('Unknown sync mode');
  if (!Array.isArray(targetRoots) || !targetRoots.length)
    throw new Error('At least one target is required');
  const source = await readSource(sourceRoot, expectedVersion);
  const plans = [];
  for (const targetRoot of targetRoots) plans.push(await planTarget(source, targetRoot));
  if (new Set(plans.map((plan) => plan.root)).size !== plans.length)
    throw new Error('Duplicate target roots are not allowed');
  let warnings = [];
  if (mode === 'write') {
    const conflicts = plans.flatMap((plan) => plan.report.conflicts);
    if (conflicts.length) throw new Error(`Sync conflict: ${conflicts.join('; ')}`);
    warnings = await writePlans(source, plans);
  }
  return {
    mode,
    version: source.version,
    clean: mode === 'write' || plans.every((plan) => plan.clean),
    targets: plans.map((plan) => plan.report),
    warnings,
  };
}

function argumentsForCli(args) {
  const options = { targetRoots: [] };
  let chosenMode;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--help') return null;
    if (['--preview', '--check', '--write'].includes(flag)) {
      if (chosenMode) throw new Error('Choose only one sync mode');
      chosenMode = flag.slice(2);
    } else if (flag === '--target' || flag === '--version') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
      if (flag === '--target') options.targetRoots.push(value);
      else options.expectedVersion = value;
    } else throw new Error(`Unknown argument: ${flag}`);
  }
  return { ...options, mode: chosenMode ?? 'preview' };
}

if (
  process.argv[1] &&
  (await fs.realpath(resolve(process.argv[1]))) === fileURLToPath(import.meta.url)
) {
  try {
    const options = argumentsForCli(process.argv.slice(2));
    if (!options)
      console.log(
        'Usage: node scripts/sync.mjs --target PATH [--target PATH] [--preview|--check|--write] [--version VERSION]',
      );
    else {
      const result = await syncBundles({
        ...options,
        sourceRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      });
      console.log(JSON.stringify(result, null, 2));
      if (result.mode === 'check' && !result.clean) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[frontend-sync] ${error.message}`);
    process.exitCode = 1;
  }
}
