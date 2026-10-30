import { formatRef, parseRef, sourceRefOf } from '../refs.js';
import { toolsFor, type Connection } from '../view/connection.js';
import type { Description } from '../view/schema.js';

/**
 * The tools of a document that work on one copy of it, and take the
 * language of a translation.
 */
const COPY_TOOLS = [
    'get_draft',
    'update_draft',
    'missing_fields',
    'get_published',
    'history',
    'get_version',
    'changes',
    'revert',
    'publish',
    'unpublish',
    'set_owner',
    'rollback',
    'translate',
];

/**
 * A document in one language: its source for the source's language, and
 * the translation for any other.
 */
export const refInLocale = (ref: string, locale: string, source: string): string => {
    const parsed = parseRef(ref);
    if (parsed === undefined) return ref;
    const plain = sourceRefOf(parsed);
    return formatRef(
        locale === source
            ? plain
            : {
                  ...plain,
                  locale,
              }
    );
};

/**
 * The source's values with a translation's own in place of the fields it
 * holds.
 */
export const withSourceValues = (
    source: Record<string, unknown> | null,
    ownFields: Description['fields'],
    own: Record<string, unknown> | null
): Record<string, unknown> => {
    const merged: Record<string, unknown> = {
        ...source,
    };
    for (const field of ownFields) {
        if (field.parent !== undefined) continue;
        delete merged[field.path];
        if (own?.[field.path] !== undefined) merged[field.path] = own[field.path];
    }
    return merged;
};

/**
 * A translation as its screen shows it: every field of the source in its
 * place, the translated ones editable and every other locked with the
 * source's value.
 */
export const withSourceFields = (translation: Description, source: Description): Description => {
    const own = new Map(translation.fields.map((field) => [field.path, field]));
    return {
        ...translation,
        fields: [
            ...source.fields.map(
                (field) =>
                    own.get(field.path) ?? {
                        ...field,
                        writable: false,
                    }
            ),
            ...translation.fields.filter((field) => !source.fields.some((candidate) => candidate.path === field.path)),
        ],
        layout: source.layout,
        draft: withSourceValues(source.draft, translation.fields, translation.draft),
    };
};

const opened = new WeakMap<Connection, Map<string, Connection>>();

/**
 * A connection that works on one translation: its document's calls name its
 * language, its description holds the source's fields around its own, and a
 * draft it answers with keeps the source's values in place. The same
 * connection for the same ref, so a screen keyed on it stays put.
 */
export const translationConnection = (connection: Connection, ref: string): Connection => {
    const parsed = parseRef(ref);
    const tools = toolsFor(ref);
    if (parsed?.locale === undefined || tools === undefined) return connection;
    const known = opened.get(connection) ?? new Map<string, Connection>();
    opened.set(connection, known);
    const found = known.get(ref);
    if (found !== undefined) return found;
    const locale = parsed.locale;
    const sourceRef = formatRef(sourceRefOf(parsed));
    let sourceDraft: Record<string, unknown> | null = null;
    let ownFields: Description['fields'] = [];
    const translated: Connection = {
        ...connection,
        call: async (name, input, options) => {
            if (name === 'editing_describe' && (input?.['query'] as { ref?: unknown } | undefined)?.ref === ref) {
                const [answer, source] = await Promise.all([
                    connection.call<Description>(name, input, options),
                    connection.call<Description>(
                        name,
                        {
                            query: {
                                ref: sourceRef,
                            },
                        },
                        options
                    ),
                ]);
                if (answer.status !== 200) return answer as never;
                if (source.status !== 200) return source as never;
                sourceDraft = source.body.draft;
                ownFields = answer.body.fields;
                return {
                    ...answer,
                    body: withSourceFields(answer.body, source.body),
                } as never;
            }
            if (!name.startsWith(`${tools.prefix}_`) || !COPY_TOOLS.includes(name.slice(tools.prefix.length + 1))) {
                return connection.call(name, input, options);
            }
            const answer = await connection.call(
                name,
                {
                    ...input,
                    query: {
                        ...((input?.['query'] ?? {}) as Record<string, unknown>),
                        locale,
                    },
                },
                options
            );
            const body = answer.body as { ref?: unknown; content?: unknown } | undefined;
            if (answer.status !== 200 || body?.ref !== ref || !('content' in body)) return answer as never;
            return {
                ...answer,
                body: {
                    ...body,
                    content: withSourceValues(sourceDraft, ownFields, body.content as Record<string, unknown> | null),
                },
            } as never;
        },
    };
    known.set(ref, translated);
    return translated;
};
