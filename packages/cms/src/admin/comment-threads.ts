import type { CommentView, PersonView } from '../view/schema.js';

/**
 * A comment that starts a thread, with its answers, oldest first.
 */
export interface Thread {
    root: CommentView;
    answers: CommentView[];
}

/**
 * The threads among a document's comments, oldest first. Comments left in a
 * review stay with the review, so only the draft's own start threads here.
 */
export const threadsOf = (comments: readonly CommentView[]): Thread[] => {
    const threads = comments
        .filter((comment) => comment.replyTo === null && comment.review === null)
        .map(
            (root): Thread => ({
                root,
                answers: [],
            })
        );
    for (const comment of comments) {
        if (comment.replyTo === null) continue;
        threads.find((thread) => thread.root.id === comment.replyTo)?.answers.push(comment);
    }
    return threads;
};

/**
 * The open threads on one field.
 */
export const openThreadsOn = (threads: readonly Thread[], path: string): Thread[] =>
    threads.filter((thread) => thread.root.path === path && thread.root.resolvedAt === null);

/**
 * The phrases an open thread marks in one field, with the thread each opens:
 * the first place the field's text holds each, and none for a phrase it
 * lost.
 */
export const marksOf = (threads: readonly Thread[], text: string): Array<{ thread: string; start: number; end: number }> =>
    threads.flatMap((thread) => {
        const anchor = thread.root.anchor;
        if (anchor === null || anchor.text === '') return [];
        const start = text.indexOf(anchor.text);
        return start === -1
            ? []
            : [
                  {
                      thread: thread.root.id,
                      start,
                      end: start + anchor.text.length,
                  },
              ];
    });

/**
 * The thread whose phrase holds a place in the text, for a click there.
 */
export const threadAt = (marks: ReadonlyArray<{ thread: string; start: number; end: number }>, offset: number): string | undefined =>
    marks.find((mark) => offset >= mark.start && offset <= mark.end)?.thread;

/**
 * The longest phrase a comment quotes.
 */
const LONGEST_PHRASE = 500;

/**
 * What a selection quotes, trimmed, or `undefined` when it cannot anchor a
 * comment: nothing but space, more than one line, or too long.
 */
export const phraseOf = (selected: string): string | undefined => {
    const phrase = selected.trim();
    if (phrase === '' || phrase.includes('\n') || phrase.length > LONGEST_PHRASE) return undefined;
    return phrase;
};

/**
 * The name being typed after `@` just before the caret, like `kar` in
 * `ask @kar`, or `undefined` when the caret is not in a mention.
 */
export const mentionQueryAt = (text: string, caret: number): string | undefined => {
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) return undefined;
    if (at > 0 && !/\s/.test(before[at - 1]!)) return undefined;
    const query = before.slice(at + 1);
    // A mention is a name, so it ends at a line break or after a few words.
    if (query.includes('\n') || query.split(' ').length > 3) return undefined;
    return query;
};

/**
 * The text with the mention being typed before the caret replaced by the
 * person's name, and where the caret goes after it.
 */
export const withMention = (text: string, caret: number, person: PersonView): { text: string; caret: number } => {
    const at = text.slice(0, caret).lastIndexOf('@');
    // A space follows the name, unless the text already has one there.
    const inserted = `@${person.name}${/^\s/.test(text.slice(caret)) ? '' : ' '}`;
    return {
        text: `${text.slice(0, at)}${inserted}${text.slice(caret)}`,
        caret: at + inserted.length,
    };
};

/**
 * The people the text still mentions by name, among those picked.
 */
export const mentionsIn = (text: string, picked: readonly PersonView[]): string[] => [
    ...new Set(picked.filter((person) => text.includes(`@${person.name}`)).map((person) => person.id)),
];

/**
 * The people a mention offers for what was typed: names that start with it,
 * or have a word that does, the person writing left out.
 */
export const mentionCandidatesOf = <Candidate extends PersonView>(
    people: readonly Candidate[],
    query: string,
    me: string | undefined
): Candidate[] => {
    const typed = query.trim().toLowerCase();
    return people
        .filter((person) => person.id !== me)
        .filter(
            (person) =>
                typed === '' ||
                person.name
                    .toLowerCase()
                    .split(/\s+/)
                    .some((word) => word.startsWith(typed)) ||
                person.name.toLowerCase().startsWith(typed)
        )
        .slice(0, 6);
};
