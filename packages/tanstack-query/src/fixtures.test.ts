import { expect, it } from 'vitest';
import { generateFetchClient } from '@kizunajs/fetch';
import { contract } from './client.fixture.js';

/**
 * The client the other tests import, so they run and typecheck the file a
 * consumer gets. Run with `-u` after changing the fetch generator.
 */
it('the generated client is current', async () => {
    await expect(generateFetchClient(contract)).toMatchFileSnapshot('./generated/client.ts');
});
