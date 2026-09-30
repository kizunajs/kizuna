import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = path.resolve(import.meta.dirname, '../dist');

/**
 * The file a relative specifier names. A declaration file names its sibling
 * chunk by the JavaScript file, so it reads the declarations beside it.
 */
const builtFile = (importer: string, specifier: string): string => {
    const resolved = path.resolve(path.dirname(importer), specifier);
    if (!/\.d\.[cm]ts$/.test(importer)) return resolved;
    return resolved.replace(/\.mjs$/, '.d.mts').replace(/\.cjs$/, '.d.cts');
};

/**
 * Every module specifier a built file names, following relative ones into the
 * chunks they reach.
 */
const specifiersFrom = (file: string, seen = new Set<string>()): string[] => {
    if (seen.has(file)) return [];
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    const specifiers = [...source.matchAll(/(?:from\s*|import\s*\(?\s*|require\(\s*)["']([^"']+)["']/g)].map((match) => match[1]!);
    return specifiers.flatMap((specifier) =>
        specifier.startsWith('.') ? [specifier, ...specifiersFrom(builtFile(file, specifier), seen)] : [specifier]
    );
};

describe('the built client entry', () => {
    for (const file of ['client.mjs', 'client.cjs', 'client.d.mts', 'client.d.cts']) {
        it(`${file} never reaches kizunajs`, () => {
            const built = path.join(DIST, file);
            expect(fs.existsSync(built), 'run `pnpm build` first').toBe(true);

            expect(specifiersFrom(built).filter((specifier) => specifier.startsWith('kizunajs'))).toEqual([]);
        });
    }

    it('imports nothing at runtime', () => {
        expect(specifiersFrom(path.join(DIST, 'client.mjs'))).toEqual([]);
        expect(specifiersFrom(path.join(DIST, 'client.cjs'))).toEqual([]);
    });
});
