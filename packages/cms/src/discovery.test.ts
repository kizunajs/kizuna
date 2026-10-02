import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverPages, pageNameIn, renderPagesModule, routePathOf, defaultPagesOutput } from './discovery.js';

const fixtures = join(fileURLToPath(new URL('.', import.meta.url)), '__fixtures__', 'app');

const temporary: string[] = [];

afterEach(() => {
    for (const folder of temporary) {
        rmSync(folder, {
            recursive: true,
            force: true,
        });
    }
    temporary.length = 0;
});

describe('discoverPages', () => {
    it('finds every content.ts and derives the path from its folder', () => {
        expect(discoverPages(fixtures).map(({ name, path }) => ({ name, path }))).toEqual([
            {
                name: 'frontPage',
                path: '/',
            },
            {
                name: 'aboutPage',
                path: '/about',
            },
            {
                name: 'photoPage',
                path: '/photo',
            },
        ]);
    });

    it('fails on two pages with one name and names both files', () => {
        const root = mkdtempSync(join(tmpdir(), 'kizuna-cms-'));
        temporary.push(root);
        for (const folder of ['one', 'two']) {
            mkdirSync(join(root, folder));
            writeFileSync(join(root, folder, 'content.ts'), "export default definePage({\n    name: 'samePage',\n    fields: [],\n});\n");
        }
        expect(() => discoverPages(root)).toThrow(/Two pages are named 'samePage':\n {2}.*one.*\n {2}.*two/);
    });

    it('fails on a content.ts without a literal name', () => {
        const root = mkdtempSync(join(tmpdir(), 'kizuna-cms-'));
        temporary.push(root);
        writeFileSync(join(root, 'content.ts'), 'export default page(definition);\n');
        expect(() => discoverPages(root)).toThrow('literal name');
    });

    it('returns nothing for a missing directory', () => {
        expect(discoverPages('/nowhere/app')).toEqual([]);
    });
});

describe('routePathOf', () => {
    it('drops route groups, slots and intercepting markers', () => {
        expect(routePathOf('/app', '/app/(marketing)/about')).toBe('/about');
        expect(routePathOf('/app', '/app/@modal/(.)photo')).toBe('/photo');
        expect(routePathOf('/app', '/app')).toBe('/');
    });
});

describe('pageNameIn', () => {
    it('reads the name from definePage({ name })', () => {
        expect(pageNameIn("export default definePage({\n    name: 'frontPage',\n    fields: [],\n});")).toBe('frontPage');
        expect(pageNameIn('const x = 1;')).toBeUndefined();
    });
});

describe('renderPagesModule', () => {
    it('imports each page relative to the output and keys it by name', () => {
        const rendered = renderPagesModule(
            [
                {
                    name: 'frontPage',
                    path: '/',
                    file: '/project/src/app/content.ts',
                },
            ],
            '/project/src/cms.pages.ts'
        );
        expect(rendered).toContain("import frontPage from './app/content';");
        expect(rendered).toContain("        path: '/',");
        expect(rendered).toContain('        page: frontPage,');
        expect(defaultPagesOutput('/project/src/app')).toBe('/project/src/cms.pages.ts');
    });
});
