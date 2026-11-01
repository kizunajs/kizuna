import { isUnder } from '../glossary.js';
import type { DescribedField, GlossaryIssue } from '../view/schema.js';

/**
 * The document's glossary issues after a save: those in the fields it wrote
 * as the save answers them, and the rest as they were.
 */
export const glossaryAfter = (
    before: readonly GlossaryIssue[] | undefined,
    written: readonly GlossaryIssue[] | undefined,
    paths: readonly string[]
): GlossaryIssue[] | undefined => {
    if (written === undefined) return before === undefined ? undefined : [...before];
    return [...(before ?? []).filter((issue) => !paths.some((path) => isUnder(issue, path))), ...written];
};

/**
 * The issues a field shows under it: those in it, unless a field inside it
 * that the form shows holds them.
 */
export const glossaryUnder = (
    issues: readonly GlossaryIssue[] | undefined,
    fields: readonly DescribedField[],
    field: DescribedField
): GlossaryIssue[] =>
    (issues ?? []).filter(
        (issue) =>
            isUnder(issue, field.path) &&
            !fields.some((inner) => inner.path !== field.path && inner.path.startsWith(`${field.path}.`) && isUnder(issue, inner.path))
    );
