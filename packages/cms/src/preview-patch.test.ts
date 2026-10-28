import { describe, expect, it } from 'vitest';
import { decodeSource } from './source-marks.js';
import { withSourcePath } from './source-path.js';
import { patchTexts } from './preview-patch.js';

/**
 * A page's text nodes, as far as `patchTexts` walks them.
 */
const pageOf = (texts: string[]) => {
    const nodes = texts.map((nodeValue) => ({
        nodeValue,
    }));
    const root = {
        ownerDocument: {
            createTreeWalker: () => {
                let index = -1;
                return {
                    nextNode: () => nodes[++index] ?? null,
                };
            },
        },
    } as unknown as Element;
    return {
        root,
        nodes,
    };
};

describe('patching draft text in place', () => {
    it('replaces the text at a path and keeps its mark', () => {
        const page = pageOf([withSourcePath('Spring sale', 'heading', 'page:frontPage'), 'Opening hours']);
        expect(
            patchTexts(page.root, {
                ref: 'page:frontPage',
                texts: {
                    heading: 'Summer sale',
                },
            })
        ).toBe(true);
        expect(page.nodes[0]!.nodeValue.startsWith('Summer sale')).toBe(true);
        expect(decodeSource(page.nodes[0]!.nodeValue)).toEqual({
            ref: 'page:frontPage',
            path: 'heading',
        });
        expect(page.nodes[1]!.nodeValue).toBe('Opening hours');
    });

    it('leaves the page alone when a path is not shown, or another document holds it', () => {
        const heading = withSourcePath('Spring sale', 'heading', 'item:articles:k3j9x2');
        const page = pageOf([heading]);
        expect(
            patchTexts(page.root, {
                ref: 'page:frontPage',
                texts: {
                    heading: 'Summer sale',
                },
            })
        ).toBe(false);
        expect(page.nodes[0]!.nodeValue).toBe(heading);
    });

    it('leaves text joined with other text in one node alone', () => {
        const joined = `${withSourcePath('Spring', 'heading', 'page:frontPage')} ${withSourcePath('sale', 'tagline', 'page:frontPage')}`;
        const page = pageOf([joined]);
        expect(
            patchTexts(page.root, {
                ref: 'page:frontPage',
                texts: {
                    heading: 'Summer',
                },
            })
        ).toBe(false);
        expect(page.nodes[0]!.nodeValue).toBe(joined);
    });

    it('asks for a render when the change carries no text', () => {
        const page = pageOf([withSourcePath('Spring sale', 'heading', 'page:frontPage')]);
        expect(
            patchTexts(page.root, {
                ref: 'page:frontPage',
                texts: null,
            })
        ).toBe(false);
    });
});
