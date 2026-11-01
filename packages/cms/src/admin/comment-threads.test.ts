import { describe, expect, it } from 'vitest';
import type { CommentView } from '../view/schema.js';
import {
    marksOf,
    mentionCandidatesOf,
    mentionQueryAt,
    mentionsIn,
    openThreadsOn,
    phraseOf,
    threadAt,
    threadsOf,
    withMention,
} from './comment-threads.js';

const kari = {
    id: 'kari',
    name: 'Kari Nordmann',
};

const nils = {
    id: 'nils',
    name: 'Nils Aas',
};

const comment = (id: string, changes: Partial<CommentView> = {}): CommentView => ({
    id,
    path: 'heading',
    text: 'Which city?',
    by: kari,
    via: null,
    createdAt: '2026-10-29T10:05:00.000Z',
    resolvedBy: null,
    resolvedAt: null,
    replyTo: null,
    review: null,
    anchor: null,
    mentions: [],
    assignee: null,
    ...changes,
});

describe('comment threads', () => {
    it('gathers answers under the comment that starts each thread, and leaves review comments to the review', () => {
        const threads = threadsOf([
            comment('comment-1'),
            comment('comment-2', {
                review: 'review-1',
            }),
            comment('comment-3', {
                replyTo: 'comment-1',
            }),
            comment('comment-4', {
                path: 'intro',
                resolvedAt: '2026-10-29T11:00:00.000Z',
            }),
        ]);
        expect(threads.map((thread) => [thread.root.id, thread.answers.map((answer) => answer.id)])).toEqual([
            ['comment-1', ['comment-3']],
            ['comment-4', []],
        ]);
        expect(openThreadsOn(threads, 'heading').map((thread) => thread.root.id)).toEqual(['comment-1']);
        expect(openThreadsOn(threads, 'intro')).toEqual([]);
    });

    it('marks the first place the text holds each phrase, and finds the thread at a click there', () => {
        const threads = threadsOf([
            comment('comment-1', {
                anchor: {
                    text: 'Bergen',
                    changed: false,
                },
            }),
            comment('comment-2', {
                anchor: {
                    text: 'Trondheim',
                    changed: true,
                },
            }),
        ]);
        const marks = marksOf(threads, 'Spring opens in Bergen and Bergen again');
        expect(marks).toEqual([
            {
                thread: 'comment-1',
                start: 16,
                end: 22,
            },
        ]);
        expect(threadAt(marks, 18)).toBe('comment-1');
        expect(threadAt(marks, 2)).toBeUndefined();
    });

    it('quotes a selection on one line, trimmed', () => {
        expect(phraseOf('  in Bergen ')).toBe('in Bergen');
        expect(phraseOf('   ')).toBeUndefined();
        expect(phraseOf('one\ntwo')).toBeUndefined();
        expect(phraseOf('x'.repeat(501))).toBeUndefined();
    });
});

describe('mentions', () => {
    it('reads the name typed after @ before the caret', () => {
        expect(mentionQueryAt('ask @kar', 8)).toBe('kar');
        expect(mentionQueryAt('@', 1)).toBe('');
        expect(mentionQueryAt('mail me at me@example.com', 25)).toBeUndefined();
        expect(mentionQueryAt('no mention', 10)).toBeUndefined();
    });

    it('puts the name in place of what was typed, and keeps the people the text still names', () => {
        const mentioned = withMention('ask @kar now', 8, kari);
        expect(mentioned).toEqual({
            text: 'ask @Kari Nordmann now',
            caret: 18,
        });
        expect(withMention('@ka', 3, kari).text).toBe('@Kari Nordmann ');
        expect(mentionsIn(mentioned.text, [kari, nils])).toEqual(['kari']);
        expect(mentionsIn('ask now', [kari])).toEqual([]);
    });

    it('offers the people whose name or a word of it starts with what was typed, the writer left out', () => {
        expect(mentionCandidatesOf([kari, nils], 'no', 'nils').map((person) => person.id)).toEqual(['kari']);
        expect(mentionCandidatesOf([kari, nils], 'aa', undefined).map((person) => person.id)).toEqual(['nils']);
        expect(mentionCandidatesOf([kari, nils], '', 'kari').map((person) => person.id)).toEqual(['nils']);
    });
});
