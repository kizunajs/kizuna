import { describe, expect, it } from 'vitest';
import { confirmationTextOf } from './confirm.js';

describe('confirmationTextOf', () => {
    it('makes the question the title and what follows the line under it', () => {
        expect(confirmationTextOf('Unpublish 3 articles? Their drafts stay, and visitors stop seeing them.')).toEqual({
            title: 'Unpublish 3 articles?',
            detail: 'Their drafts stay, and visitors stop seeing them.',
        });
    });

    it('keeps a lone question whole', () => {
        expect(confirmationTextOf('Post this article to the team channel?')).toEqual({
            title: 'Post this article to the team channel?',
            detail: undefined,
        });
    });

    it('keeps a sentence without a question mark whole', () => {
        expect(confirmationTextOf('This sends the newsletter.')).toEqual({
            title: 'This sends the newsletter.',
            detail: undefined,
        });
    });
});
