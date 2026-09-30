import { describe, expect, it } from 'vitest';
import type { ApiDefinition } from 'kizunajs';
import { generateFetchClient } from './generator.js';
import { apiContract } from './api.fixture.js';
import { requiredContextContract } from './required-context.fixture.js';
import { securedContract } from './secured.fixture.js';

/**
 * The clients the other tests import, so they run and typecheck the file a
 * consumer gets. Run with `-u` after changing the generator.
 */
const fixtures: Record<string, ApiDefinition> = {
    api: apiContract,
    'required-context': requiredContextContract,
    secured: securedContract,
};

describe('the generated fixtures are current', () => {
    for (const [name, api] of Object.entries(fixtures)) {
        it(name, async () => {
            await expect(generateFetchClient(api)).toMatchFileSnapshot(`./generated/${name}.ts`);
        });
    }
});
