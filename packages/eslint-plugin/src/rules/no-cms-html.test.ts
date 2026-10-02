import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { noCmsHtml } from './no-cms-html.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'cms');

const linesFor = async (fixture: string): Promise<number[]> => {
    const eslint = new ESLint({
        cwd: fixturesDir,
        overrideConfigFile: true,
        overrideConfig: {
            files: ['**/*.tsx'],
            languageOptions: {
                parser: tseslint.parser,
                parserOptions: {
                    ecmaFeatures: {
                        jsx: true,
                    },
                },
            },
            plugins: { kizuna: { rules: { 'no-cms-html': noCmsHtml } } },
            rules: { 'kizuna/no-cms-html': 'error' },
        } as never,
    });
    const [result] = await eslint.lintFiles([path.join(fixturesDir, fixture)]);
    return (result?.messages ?? []).map((message) => message.line);
};

describe('no-cms-html', () => {
    it('flags HTML built from a page read with cms.pages.<name>.get(), whole or destructured', async () => {
        expect(await linesFor('page-html.tsx')).toEqual([8, 9]);
    });

    it('flags a component whose props are an Output, and everything in a file importing the CMS', async () => {
        expect(await linesFor('block-props.tsx')).toEqual([5, 9]);
    });

    it('leaves HTML from elsewhere alone', async () => {
        expect(await linesFor('unrelated.tsx')).toEqual([]);
    });
});
