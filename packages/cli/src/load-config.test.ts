import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { loadConfig } from './load-config.js';

const FIXTURES = path.resolve(import.meta.dirname, '../__fixtures__');

describe('loadConfig', () => {
    it('loads a config that imports through a path alias and reaches a .tsx file', async () => {
        const loaded = await loadConfig(path.join(FIXTURES, 'aliased-jsx-config', 'kizuna.config.ts'));
        expect(loaded).toHaveLength(1);
        expect(Object.keys(loaded[0]!.api.routes)).toEqual(['users']);
    });
});
