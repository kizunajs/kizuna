import { describe, expect, it } from 'vitest';
import { isElement, ownFrames, pageBoxOf, shownRoots } from './preview-frames.js';

const rect = (top: number, left: number, width = 0, height = 0) => ({
    getBoundingClientRect: () => ({
        top,
        left,
        width,
        height,
    }),
});

describe('ownFrames', () => {
    it("reads the frames on the page's own origin and skips the others", () => {
        const email = {
            body: {
                id: 'email',
            },
        };
        const own = {
            contentDocument: email,
        };
        const elsewhere = {
            get contentDocument(): never {
                throw new Error('Blocked a frame from accessing a cross-origin frame.');
            },
        };
        const empty = {
            contentDocument: null,
        };
        const page = {
            body: {
                id: 'page',
            },
            querySelectorAll: () => [own, elsewhere, empty],
        } as unknown as Document;
        expect(ownFrames(page)).toEqual([
            {
                frame: own,
                document: email,
            },
        ]);
        expect(shownRoots(page)).toEqual([
            {
                id: 'page',
            },
            {
                id: 'email',
            },
        ]);
    });
});

describe('isElement', () => {
    it("knows a frame's elements, which instanceof does not", () => {
        expect(
            isElement({
                nodeType: 1,
            } as unknown as EventTarget)
        ).toBe(true);
        expect(
            isElement({
                nodeType: 3,
            } as unknown as EventTarget)
        ).toBe(false);
        expect(isElement(null)).toBe(false);
    });
});

describe('pageBoxOf', () => {
    it("places a field inside a frame by the frame's place on the page", () => {
        const page = {} as Window;
        const frameView = {
            parent: page,
            frameElement: {
                ...rect(200, 40),
                clientTop: 1,
                clientLeft: 1,
            },
        } as unknown as Window;
        const heading = {
            ...rect(30, 20, 300, 24),
            ownerDocument: {
                defaultView: frameView,
            },
        } as unknown as Element;
        expect(pageBoxOf(heading, page)).toEqual({
            top: 231,
            left: 61,
            width: 300,
            height: 24,
        });
    });

    it("stops at the page, though the editor's frame around it is on the same origin", () => {
        const editor = {} as Window;
        const page = {
            parent: editor,
            frameElement: {
                ...rect(500, 500),
                clientTop: 0,
                clientLeft: 0,
            },
        } as unknown as Window;
        const heading = {
            ...rect(30, 20, 300, 24),
            ownerDocument: {
                defaultView: page,
            },
        } as unknown as Element;
        expect(pageBoxOf(heading, page)).toEqual({
            top: 30,
            left: 20,
            width: 300,
            height: 24,
        });
    });
});
