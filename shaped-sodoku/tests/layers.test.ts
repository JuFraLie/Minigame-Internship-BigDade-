import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The architecture, enforced mechanically.
 *
 * Hexagonal rules are easy to agree with and easy to break one import at a time, so this
 * suite walks every file under `src/` and checks the layer matrix, the bridge audit rule,
 * and the environment bans. A violation here fails the build the same way a broken rule
 * would — which is the only way these guarantees survive a refactor.
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

type Layer = 'domain' | 'input' | 'render-pure' | 'render-phaser' | 'bridge-module' | 'bridge-adapter' | 'app' | 'scenes' | 'entry';

function layerOf(relative: string): Layer | null {
    if (relative.startsWith('domain/')) return 'domain';
    if (relative.startsWith('input/')) return 'input';
    if (relative.startsWith('render/')) {
        const name = relative.slice('render/'.length);
        return ['GameLayout.ts', 'palette.ts', 'RenderPort.ts'].includes(name) ? 'render-pure' : 'render-phaser';
    }
    if (relative.startsWith('bridge/')) return relative.endsWith('MpBridge.ts') ? 'bridge-module' : 'bridge-adapter';
    if (relative.startsWith('app/')) return 'app';
    if (relative.startsWith('scenes/')) return 'scenes';
    if (relative === 'main.ts') return 'entry';
    return null;
}

/**
 * Which parts of `src/` each layer may reach.
 *
 * The arrow always points inward: adapters and presentation know about the domain, and the
 * domain knows about nothing at all.
 */
const ALLOWED_TARGETS: Record<Layer, (target: string) => boolean> = {
    domain: (target) => target.startsWith('domain/'),
    input: (target) => target.startsWith('domain/') || target === 'render/GameLayout.ts',
    'render-pure': (target) => target.startsWith('domain/') || target.startsWith('render/GameLayout.ts'),
    'render-phaser': (target) => target.startsWith('domain/') || target.startsWith('render/'),
    'bridge-module': () => false,
    'bridge-adapter': (target) => target === 'bridge/MpBridge.ts' || target === 'domain/ports.ts',
    app: () => true,
    scenes: (target) =>
        target.startsWith('domain/') ||
        target.startsWith('render/') ||
        target.startsWith('app/') ||
        target.startsWith('scenes/') ||
        target.startsWith('input/') ||
        target.startsWith('bridge/'),
    entry: (target) => target.startsWith('bridge/') || target.startsWith('app/'),
};

/** Layers allowed to load Phaser at runtime. Game logic must be able to run without it. */
const PHASER_LAYERS = new Set<Layer>(['render-phaser', 'app', 'scenes']);

/** Strips comments so documentation cannot be mistaken for a real dependency. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface Dependency {
    readonly specifier: string;
    readonly typeOnly: boolean;
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
    assert.ok(FILES.length >= 15, `expected a real codebase, found ${FILES.length} files`);
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
                // A bare specifier: only Phaser, and only where Phaser is expected.
                if (dependency.specifier === 'phaser' && !PHASER_LAYERS.has(layer)) {
                    violations.push(`${relative} (${layer}) imports phaser`);
                }
                continue;
            }

            if (!allowed(target)) violations.push(`${relative} (${layer}) → ${target}`);
        }
    }

    assert.deepEqual(violations, [], `disallowed imports:\n  ${violations.join('\n  ')}`);
});

test('the domain and the input adapter never learn that Phaser exists', () => {
    for (const [relative, source] of SOURCE) {
        const layer = layerOf(relative);
        if (layer !== 'domain' && layer !== 'input') continue;
        assert.ok(!stripComments(source).includes("from 'phaser'"), `${relative} depends on Phaser`);
        assert.ok(!stripComments(source).includes('from "phaser"'), `${relative} depends on Phaser`);
    }
});

test('only MpBridge.ts touches window.MpPostMessage', () => {
    const offenders = [...SOURCE]
        .filter(([relative, source]) => source.includes('MpPostMessage') && relative !== 'bridge/MpBridge.ts')
        .map(([relative]) => relative);
    assert.deepEqual(offenders, [], 'host communication must be auditable in exactly one file');
});

test('scenes consume ports and never reach for a concrete implementation', () => {
    const violations: string[] = [];

    for (const [relative, source] of SOURCE) {
        if (layerOf(relative) !== 'scenes') continue;

        // The renderer's concrete class must only be named where it is wired up.
        if (source.includes('PhaserCanvasRenderer')) violations.push(`${relative} names the concrete renderer`);

        for (const dependency of dependencies(source)) {
            const target = resolve(relative, dependency.specifier);
            if (target?.startsWith('input/') && !dependency.typeOnly) {
                violations.push(`${relative} value-imports the input adapter`);
            }
        }

        // Nothing in a scene may construct an adapter or a renderer itself.
        assert.ok(!/new\s+(PhaserCanvasRenderer|InputAdapter)\s*\(/.test(stripComments(source)), relative);
    }

    assert.deepEqual(violations, [], `wiring leaked into presentation:\n  ${violations.join('\n  ')}`);
});

test('the concrete renderer and input adapter are constructed only in the composition root', () => {
    for (const [relative, source] of SOURCE) {
        for (const name of ['PhaserCanvasRenderer', 'InputAdapter']) {
            if (!new RegExp(`new\\s+${name}\\s*\\(`).test(stripComments(source))) continue;
            assert.equal(relative, 'app/composition.ts', `${relative} constructs ${name}`);
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

test('Phaser is instantiated as CANVAS, and only there', () => {
    // Comments are ignored: the rule is about how Phaser is *configured*, not what any
    // doc-comment claims about it.
    const canvasUsers = [...SOURCE]
        .filter(([, source]) => stripComments(source).includes('Phaser.CANVAS'))
        .map(([relative]) => relative);

    assert.deepEqual(canvasUsers, ['app/composition.ts'], 'exactly one place decides the renderer');

    const [, source] = [...SOURCE].find(([relative]) => relative === 'app/composition.ts') ?? [];
    assert.ok(source && /type:\s*Phaser\.CANVAS/.test(source), 'the game config must set Phaser.CANVAS');
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
