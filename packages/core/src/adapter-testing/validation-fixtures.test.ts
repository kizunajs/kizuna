import { describe, expect, it } from 'vitest';
import { VALIDATION_FIXTURES, expectedValidation } from './validation-fixtures.js';

describe('validation fixtures', () => {
    for (const fixture of VALIDATION_FIXTURES) {
        it(fixture.key, () => {
            const expected = expectedValidation(fixture);
            if (fixture.key === 'valid-request') {
                expect(expected).toBeUndefined();
                return;
            }
            expect(expected).toBeDefined();
            expect(expected!.errors.length).toBeGreaterThan(0);
            expect(expected).toMatchSnapshot();
        });
    }
});
