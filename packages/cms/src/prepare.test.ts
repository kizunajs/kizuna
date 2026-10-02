import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepare } from './cli.js';

const contentFile = (name: string): string => `export default definePage({\n    name: '${name}',\n    fields: [],\n});\n`;

let root: string | undefined;

afterEach(() => {
    if (root === undefined) return;
    rmSync(root, {
        recursive: true,
        force: true,
    });
});

const project = (): string => {
    root = mkdtempSync(join(tmpdir(), 'kizuna-cms-prepare-'));
    mkdirSync(join(root, 'src/app/about'), {
        recursive: true,
    });
    writeFileSync(join(root, 'src/app/about/content.ts'), contentFile('aboutPage'));
    writeFileSync(join(root, 'kizuna.config.ts'), '');
    return root;
};

describe('prepare', () => {
    it('rewrites a pages module that still imports a page that moved', async () => {
        const folder = project();
        const output = join(folder, 'src/cms.pages.ts');
        writeFileSync(output, "import movedPage from './app/moved/content';\n");
        const check = await prepare({
            cwd: folder,
            configPath: join(folder, 'kizuna.config.ts'),
            check: true,
        });
        expect(check).toEqual([
            {
                output,
                changed: true,
            },
        ]);
        expect(readFileSync(output, 'utf8')).toContain('moved');
        await prepare({
            cwd: folder,
            configPath: join(folder, 'kizuna.config.ts'),
            check: false,
        });
        expect(readFileSync(output, 'utf8')).toContain("import aboutPage from './app/about/content';");
        expect(
            await prepare({
                cwd: folder,
                configPath: join(folder, 'kizuna.config.ts'),
                check: true,
            })
        ).toEqual([
            {
                output,
                changed: false,
            },
        ]);
    });

    it('leaves a project alone that keeps its pages module somewhere else', async () => {
        const folder = project();
        expect(
            await prepare({
                cwd: folder,
                configPath: join(folder, 'kizuna.config.ts'),
                check: false,
            })
        ).toEqual([]);
    });
});
