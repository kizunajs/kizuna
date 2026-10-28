import { vercelStegaDecodeAll, vercelStegaSplit } from '@vercel/stega';
import { decodeSource } from './source-marks.js';

/**
 * What the draft events route sends when a draft the page shows changes.
 */
export interface DraftChange {
    ref: string;
    texts: Record<string, string> | null;
}

/**
 * Puts the new text in every text node the page marks with the document and
 * one of the paths, keeping the mark so pointing at the field still works.
 * Answers `false`, and changes nothing, when a path is not shown as a text
 * node of its own, so the page renders again instead.
 */
export const patchTexts = (root: Element, change: DraftChange): boolean => {
    if (change.texts === null) return false;
    const texts = change.texts;
    const found: Array<{ node: Text; path: string; mark: string }> = [];
    const walker = root.ownerDocument.createTreeWalker(root, 4);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const source = decodeSource(node.nodeValue ?? '');
        if (source?.ref !== change.ref || !Object.hasOwn(texts, source.path)) continue;
        const value = node.nodeValue ?? '';
        const mark = vercelStegaSplit(value).encoded;
        // Text joined with other text in one node cannot be told apart from it.
        if (vercelStegaDecodeAll(value).length !== 1 || !value.endsWith(mark)) return false;
        found.push({
            node: node as Text,
            path: source.path,
            mark,
        });
    }
    if (Object.keys(texts).some((path) => !found.some((candidate) => candidate.path === path))) return false;
    for (const { node, path, mark } of found) node.nodeValue = `${texts[path]}${mark}`;
    return true;
};
