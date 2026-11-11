import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The architecture, enforced mechanically (AGENTS.md §4.3).
 *
 * Hexagonal rules are easy to agree with and easy to break one import at a time, so
 * this suite walks every file under `src/` and checks the layer matrix, the bridge
 * audit rule, and the environment bans. A violation here fails the build the same way a
 * broken rule would — which is the only way these guarantees survive a refactor.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(directory: string, base = ''): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const relative = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) found.push(...walk(join(directory, entry.name), relative));
        else if (entry.name.endsWith('.ts')) found.push(relative);
    }
    return found.sort();
}

type Layer =
    | 'domain'
    | 'app'
    | 'testing'
    | 'bridge-module'
    | 'bridge-adapter'
    | 'render'
    | 'root'
    | 'entry';

function layerOf(relative: string): Layer | null {
    if (relative.startsWith('domain/')) return 'domain';
    if (relative.startsWith('app/')) return 'app';
    if (relative.startsWith('testing/')) return 'testing';
    if (relative === 'adapters/MpBridge.ts') return 'bridge-module';
    if (relative === 'adapters/hostBridge.ts') return 'bridge-adapter';
    if (relative.startsWith('adapters/phaser/')) return 'render';
    if (relative === 'composition.ts') return 'root';
    if (relative === 'main.ts') return 'entry';
    return null;
}

interface Dependency {
    readonly specifier: string;
    readonly typeOnly: boolean;
}

/**
 * Which parts of `src/` each layer may reach.
 *
 * The arrow always points inward: adapters and presentation know about the domain, and
 * the domain knows about nothing at all. Only `app/deps.ts` may look outward, and only
 * with type-only imports — that is where the composition contracts are declared.
 */
const ALLOWED_TARGETS: Record<Layer, (target: string, dependency: Dependency) => boolean> = {
    domain: (target) => target.startsWith('domain/'),
    app: (target, dependency) =>
        target.startsWith('domain/') ||
        target.startsWith('app/') ||
        (dependency.typeOnly && target.startsWith('adapters/phaser/')),
    testing: (target) => target.startsWith('domain/') || target.startsWith('app/'),
    // The bridge module is preserved verbatim: it imports nothing at all.
    'bridge-module': () => false,
    'bridge-adapter': (target) => target === 'adapters/MpBridge.ts' || target === 'app/ports.ts',
    // The Phaser world may speak to the domain, to the app's ports and to its siblings;
    // it may not reach the testing layer or the composition root.
    render: (target) =>
        target.startsWith('domain/') || target.startsWith('app/') || target.startsWith('adapters/'),
    // The composition root is the one place that may name everything at once.
    root: () => true,
    entry: (target) => target === 'adapters/MpBridge.ts' || target === 'composition.ts' || target.startsWith('app/'),
};

/** Layers allowed to load Phaser as a value. Game logic must run without it. */
const PHASER_LAYERS = new Set<Layer>(['render', 'root']);

/** Strips comments so documentation cannot be mistaken for a real dependency. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function dependencies(source: string): Dependency[] {
    const code = stripComments(source);
    const found: Dependency[] = [];

    const importPattern = /import\s+(type\s+)?[\s\S]*?from\s*["']([^"']+)["']/g;
    for (const match of code.matchAll(importPattern)) {
        found.push({ specifier: match[2], typeOnly: match[1] === 'type ' });
    }

    // `export … from` is a dependency too, even though nothing is imported.
    const reExportPattern = /export\s+(?:type\s+)?[\s\S]*?from\s*["']([^"']+)["']/g;
    for (const match of code.matchAll(reExportPattern)) {
        found.push({ specifier: match[1], typeOnly: true });
    }

    // A dynamic import is a dependency as well — the boot screen uses one on purpose.
    const dynamicPattern = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
    for (const match of code.matchAll(dynamicPattern)) {
        found.push({ specifier: match[1], typeOnly: false });
    }

    return found;
}

/** Resolves a relative specifier back to a path rooted at `src/`. */
function resolve(fromRelativePath: string, specifier: string): string | null {
    if (!specifier.startsWith('.')) return null;
    const fromDir = fromRelativePath.split('/').slice(0, -1);
    const out: string[] = [];
    for (const part of [...fromDir, ...specifier.split('/')]) {
        if (part === '.' || part === '') continue;
        if (part === '..') out.pop();
        else out.push(part);
    }
    return out.join('/');
}

const FILES = walk(SRC);
const SOURCE = new Map(FILES.map((relative) => [relative, readFileSync(join(SRC, relative), 'utf8')]));

test('every file under src/ belongs to a known layer', () => {
    const unknown = FILES.filter((relative) => layerOf(relative) === null);
    assert.deepEqual(unknown, [], 'these files are outside the layer matrix');
    assert.ok(FILES.length >= 25, `expected a real codebase, found ${FILES.length} files`);
});

test('each layer imports only what its neighbours expose', () => {
    const violations: string[] = [];

    for (const [relative, source] of SOURCE) {
        const layer = layerOf(relative);
        if (!layer) continue;
        const allowed = ALLOWED_TARGETS[layer];

        for (const dependency of dependencies(source)) {
            const target = resolve(relative, dependency.specifier);

            if (target === null) {
                // A bare specifier: Phaser, and only where Phaser is expected.
                if (dependency.specifier === 'phaser') {
                    const valueImport = !dependency.typeOnly;
                    if (valueImport && !PHASER_LAYERS.has(layer)) violations.push(`${relative} (${layer}) imports phaser`);
                    if (!valueImport && layer !== 'app' && !PHASER_LAYERS.has(layer)) {
                        violations.push(`${relative} (${layer}) mentions phaser`);
                    }
                }
                continue;
            }

            if (!allowed(target, dependency)) violations.push(`${relative} (${layer}) → ${target}`);
        }
    }

    assert.deepEqual(violations, [], `disallowed imports:\n  ${violations.join('\n  ')}`);
});

test('the game world and the test harness never learn that Phaser exists', () => {
    for (const [relative, source] of SOURCE) {
        const layer = layerOf(relative);
        if (layer !== 'domain' && layer !== 'testing') continue;
        assert.ok(!source.includes("'phaser'"), `${relative} depends on Phaser`);
        assert.ok(!source.includes('"phaser"'), `${relative} depends on Phaser`);
    }
});

test('the game world and the test harness never touch the DOM or window', () => {
    for (const [relative, source] of SOURCE) {
        const layer = layerOf(relative);
        if (layer !== 'domain' && layer !== 'testing') continue;
        const code = stripComments(source);
        assert.ok(!code.includes('window.'), `${relative} reaches for window`);
        assert.ok(!code.includes('document.'), `${relative} reaches for the document`);
        assert.ok(!code.includes('globalThis'), `${relative} reaches for globalThis`);
    }
});

test('only MpBridge.ts touches window.MpPostMessage', () => {
    const offenders = [...SOURCE]
        .filter(([relative, source]) => stripComments(source).includes('MpPostMessage') && relative !== 'adapters/MpBridge.ts')
        .map(([relative]) => relative);
    assert.deepEqual(offenders, [], 'host communication must be auditable in exactly one file');
});

test('the bridge module is preserved as written', () => {
    const source = readFileSync(join(SRC, 'adapters/MpBridge.ts'), 'utf8');
    assert.ok(source.includes('FOR AI AGENTS: AVOID MODIFYING'), 'the bridge module keeps its standing header');
    for (const signal of [
        'webviewSignalLaunch',
        'webviewSignalStartRound',
        'webviewSignalEndRound',
        'webviewSignalExit',
        'waitForBridge',
    ]) {
        assert.ok(source.includes(signal), `${signal} must stay in the bridge module`);
    }
});

test('scenes consume ports and never reach for a concrete implementation', () => {
    const violations: string[] = [];

    for (const [relative, source] of SOURCE) {
        if (layerOf(relative) !== 'render' || !relative.startsWith('adapters/phaser/scenes/')) continue;

        // The renderer's concrete class must only be named where it is wired up.
        if (source.includes('PhaserCanvasRenderer')) violations.push(`${relative} names the concrete renderer`);
        if (source.includes('new InputAdapter')) violations.push(`${relative} constructs the input adapter`);

        // Nothing in a scene may build an adapter itself.
        if (/new\s+(PhaserCanvasRenderer|InputAdapter)\s*\(/.test(stripComments(source))) {
            violations.push(`${relative} wires a concrete adapter`);
        }
    }

    assert.deepEqual(violations, [], `wiring leaked into presentation:\n  ${violations.join('\n  ')}`);
});

test('the concrete renderer and input adapter are constructed only in the composition root', () => {
    for (const [relative, source] of SOURCE) {
        for (const name of ['PhaserCanvasRenderer', 'InputAdapter']) {
            if (!new RegExp(`new\\s+${name}\\s*\\(`).test(stripComments(source))) continue;
            assert.equal(relative, 'composition.ts', `${relative} constructs ${name}`);
        }
    }
});

test('the game forbids networking, storage and WebGL outright', () => {
    const banned = [
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'WebSocket',
        'XMLHttpRequest',
        'document.cookie',
        'fetch(',
        'Phaser.AUTO',
        'Phaser.WEBGL',
        'WebGLRenderer',
    ];

    for (const [relative, source] of SOURCE) {
        const code = stripComments(source);
        for (const needle of banned) {
            assert.ok(!code.includes(needle), `${relative} uses ${needle}, which the rules forbid`);
        }
    }
});

test('nothing in src/ tints, because the Canvas renderer silently ignores it', () => {
    // Phaser 3 draws a Canvas sprite with a plain ctx.drawImage and never reads
    // tintTopLeft / tintFill — tinting exists only on the WebGL path. This game is
    // Canvas-only by contract, so setTint() would compile, run, and change nothing.
    // Colour is baked into procedural textures and swapped with setTexture instead.
    const banned = ['setTint', 'tintFill', 'tintTopLeft'];

    for (const [relative, source] of SOURCE) {
        const code = stripComments(source);
        for (const needle of banned) {
            assert.ok(!code.includes(needle), `${relative} uses ${needle}, which the Canvas renderer ignores`);
        }
    }
});

test('Phaser is instantiated as CANVAS, and only there', () => {
    const canvasUsers = [...SOURCE]
        .filter(([, source]) => stripComments(source).includes('Phaser.CANVAS'))
        .map(([relative]) => relative);

    assert.deepEqual(canvasUsers, ['composition.ts'], 'exactly one place decides the renderer');

    const source = SOURCE.get('composition.ts') ?? '';
    assert.ok(/type:\s*Phaser\.CANVAS/.test(stripComments(source)), 'the game config must set Phaser.CANVAS');
});

test('nothing in src/ reaches for an external resource or a bundled asset file', () => {
    const banned = [/https?:\/\//, /\/\/[\w-]+\.\w+\//, /\burl\s*\(/, /\.(png|jpe?g|gif|svg|mp3|ogg|wav|m4a)'/];

    for (const [relative, source] of SOURCE) {
        const code = stripComments(source);
        for (const pattern of banned) {
            assert.ok(!pattern.test(code), `${relative} references an external or pre-made asset: ${pattern}`);
        }
    }
});

test('the scripts never invoke the removed log.js', () => {
    const manifest = readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8');
    assert.ok(!manifest.includes('log.js'), 'log.js must be deleted and not referenced by any script');
});
