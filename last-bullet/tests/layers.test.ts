import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Separation of Concerns, enforced rather than documented (AGENTS.md A4.3).
 *
 * These tests read every file under `src/` and check its imports against the
 * layer it lives in, so a future change that reaches past a boundary fails
 * `npm test` instead of quietly coupling the codebase:
 *
 *   core         -> the game world. No Phaser, no DOM, no adapters.
 *   ports        -> contracts. Depends on the core's value types, nothing else.
 *   adapters     -> implementations of ports. May use the core, never the screen.
 *   presentation -> the rendering world. May use core + ports, never adapters.
 *   app          -> the composition root: the one place allowed to know all.
 *   src/main.ts  -> the only file allowed to import the composition root.
 */

const SRC = resolve(fileURLToPath(new URL('../src', import.meta.url)));

/** Which layers each layer may import. `external` covers bare specifiers. */
const ALLOWED: Record<string, ReadonlySet<string>> = {
  // The game world and its contracts import nothing that is not their own:
  // no framework, no adapter, no node built-ins.
  core: new Set(['core', 'ports']),
  ports: new Set(['core', 'ports']),
  adapters: new Set(['core', 'ports', 'adapters', 'external']),
  presentation: new Set(['core', 'ports', 'presentation', 'external']),
  app: new Set(['core', 'ports', 'adapters', 'presentation', 'app', 'external']),
  entry: new Set(['core', 'ports', 'adapters', 'presentation', 'app', 'entry', 'external']),
};

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const sourceFiles = walk(SRC).filter((file) => file.endsWith('.ts'));

const layerOf = (file: string): string => {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  if (!rel.includes('/')) return 'entry'; // src/main.ts
  return rel.split('/')[0];
};

const importsOf = (file: string): string[] => {
  const code = readFileSync(file, 'utf8');
  return [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
};

/** Resolves a relative specifier to the file it points at. */
const resolveImport = (file: string, spec: string): string | null => {
  const target = resolve(dirname(file), spec);
  return [target, `${target}.ts`, join(target, 'index.ts')].find(existsSync) ?? null;
};

describe('layering', () => {
  test('every source file lives in a known layer', () => {
    const known = new Set([...Object.keys(ALLOWED)]);
    const strays = sourceFiles
      .filter((file) => !known.has(layerOf(file)))
      .map((file) => relative(SRC, file).replace(/\\/g, '/'));

    assert.deepEqual(strays, [], 'files found outside the declared layers');
  });

  test('every import stays inside the importing layer', () => {
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const layer = layerOf(file);
      const allowed = ALLOWED[layer];

      for (const spec of importsOf(file)) {
        const imported = spec.startsWith('.')
          ? layerOf(resolveImport(file, spec) ?? file)
          : 'external';

        if (!allowed.has(imported)) {
          violations.push(`${layer}/${relative(SRC, file)} -> ${imported} (${spec})`);
        }
      }
    }

    assert.deepEqual(violations, [], 'imports crossing a layer boundary');
  });

  test('only the bootstrap imports the composition root', () => {
    const leaks = sourceFiles
      .filter((file) => !['entry', 'app'].includes(layerOf(file)))
      .filter((file) =>
        importsOf(file).some((spec) => {
          const target = resolveImport(file, spec);
          return target !== null && layerOf(target) === 'app';
        }),
      )
      .map((file) => relative(SRC, file).replace(/\\/g, '/'));

    assert.deepEqual(leaks, [], 'app/ leaked outside src/main.ts');
  });

  test('Phaser is confined to the rendering world and the bootstrap', () => {
    const leaks = sourceFiles
      .filter((file) => !['presentation', 'entry'].includes(layerOf(file)))
      .filter((file) => importsOf(file).includes('phaser'))
      .map((file) => relative(SRC, file).replace(/\\/g, '/'));

    assert.deepEqual(leaks, [], 'Phaser imported outside presentation/');
  });

  test('the bridge module is the only code touching the host', () => {
    const touches = sourceFiles
      .filter((file) => readFileSync(file, 'utf8').includes('MpPostMessage'))
      .map((file) => relative(SRC, file).replace(/\\/g, '/'));

    assert.deepEqual(touches, ['adapters/bridge/MpBridge.ts'], 'AGENTS.md A4.2');
  });

  test('the core stays free of framework and adapter code', () => {
    const core = sourceFiles.filter((file) => layerOf(file) === 'core');

    assert.ok(core.length >= 5, 'core layer should not be empty');
    for (const file of core) {
      for (const spec of importsOf(file)) {
        assert.ok(
          spec.startsWith('.'),
          `${relative(SRC, file)} imports '${spec}': the game world must run headless`,
        );
      }
    }
  });

  test('no persistent storage, network or WebGL anywhere in src', () => {
    const banned = [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'WebSocket',
      'XMLHttpRequest',
      'fetch(',
      'WebGLRenderer',
      'Phaser.WEBGL',
    ];

    const hits: string[] = [];
    for (const file of sourceFiles) {
      const code = readFileSync(file, 'utf8');
      for (const needle of banned) {
        if (code.includes(needle)) hits.push(`${relative(SRC, file)}: ${needle}`);
      }
    }

    assert.deepEqual(hits, [], 'AGENTS.md A3.4');
  });

  test('the renderer is created with Phaser.CANVAS only', () => {
    const entry = join(SRC, 'main.ts');
    const code = readFileSync(entry, 'utf8');

    assert.match(code, /Phaser\.CANVAS/, 'must render on Canvas');
    assert.doesNotMatch(code, /Phaser\.WEBGL/, 'WebGL is forbidden');
    assert.doesNotMatch(code, /Phaser\.AUTO/, 'AUTO would enable WebGL');
  });
});
