import { useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@base-ui/react/checkbox';
import { ArrowLeft, Check } from 'lucide-react';
import { toolsFor, type Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { changeView, showValue, type ReferenceLabel } from '../view/change-value.js';
import type { People } from '../view/people.js';
import { referenceLabelsOf, shapeOfField } from '../view/review.js';
import { valueAt, type DescribedField, type DescribedLayout } from '../view/schema.js';
import { sameContent } from '../same-content.js';
import { DiffSections, type DiffEntry, type DiffLayout } from './diff.js';
import { savedAtOf, type VersionSummary } from './history.js';
import { Loading, problemOf } from './parts.js';
import { sectionLabelOf, sectionTitleOf, sectionsOf } from './sections.js';

/**
 * How many versions the list beside a comparison shows before it is opened
 * up.
 */
const SHOWN_VERSIONS = 7;

/**
 * Every field a version and the draft hold, the fields inside a field taken
 * one by one, with how each reads on both sides.
 */
export const compareEntriesOf = (
    fields: readonly DescribedField[],
    layout: readonly DescribedLayout[],
    then: Record<string, unknown> | null,
    now: Record<string, unknown> | null,
    labelOf: ReferenceLabel
): DiffEntry[] =>
    fields
        .filter((field) => !fields.some((candidate) => candidate.parent === field.path))
        .map((field): DiffEntry => {
            const before = valueAt(then, field.path);
            const after = valueAt(now, field.path);
            const shape = shapeOfField(field);
            const label = sectionLabelOf(fields, layout, field.path, field.name);
            if (sameContent(before, after)) {
                return {
                    key: field.path,
                    label,
                    note: 'Unchanged',
                    same: showValue(after, shape, labelOf),
                };
            }
            return {
                key: field.path,
                label,
                view: changeView(before, after, shape, labelOf),
            };
        });

/**
 * What a version is called in the list: "Version 21".
 */
const titleOf = (entry: VersionSummary): string => `Version ${entry.version}`;

/**
 * One version beside the current draft, field by field, side by side or
 * inline, with the other versions listed beside it to compare with instead.
 */
export function CompareVersions({
    connection,
    documentRef,
    fields,
    layout,
    draft,
    versions,
    compared,
    people,
    onPick,
    onBack,
}: {
    connection: Connection;
    documentRef: string;
    fields: readonly DescribedField[];
    layout: readonly DescribedLayout[];
    draft: Record<string, unknown> | null;
    /**
     * Every version, newest first, the current draft at the top.
     */
    versions: readonly VersionSummary[];
    compared: number;
    people: People | undefined;
    onPick: (version: number) => void;
    onBack: () => void;
}) {
    const [layoutChoice, setLayoutChoice] = useState<DiffLayout>('side');
    const [onlyChanged, setOnlyChanged] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const [loaded, setLoaded] = useState<{ version: number; entries: DiffEntry[] } | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const tools = useMemo(() => toolsFor(documentRef), [documentRef]);

    useEffect(() => {
        if (tools === undefined) return;
        let current = true;
        setProblem(undefined);
        void (async () => {
            const answer = await connection.call<{ content: Record<string, unknown> }>(`${tools.prefix}_get_version`, {
                params: {
                    ...tools.params,
                    version: compared,
                },
            });
            if (!current) return;
            if (answer.status !== 200) {
                setProblem(problemOf(answer, 'The version did not load'));
                return;
            }
            const then = answer.body.content;
            const labelOf = await referenceLabelsOf(
                connection,
                fields.flatMap((field) => [
                    {
                        value: valueAt(then, field.path),
                        shape: shapeOfField(field),
                    },
                    {
                        value: valueAt(draft, field.path),
                        shape: shapeOfField(field),
                    },
                ])
            );
            if (!current) return;
            setLoaded({
                version: compared,
                entries: compareEntriesOf(fields, layout, then, draft, labelOf),
            });
        })();
        return () => {
            current = false;
        };
    }, [connection, tools, compared, fields, layout, draft]);

    const chosen = versions.find((entry) => entry.version === compared);
    const others = versions.slice(1);
    const listed = showAll ? others : others.slice(0, SHOWN_VERSIONS);
    const nameOf = (author: string): string => people?.people.find((person) => person.id === author)?.name ?? author;
    const entries = loaded?.version === compared ? loaded.entries : undefined;
    const shown = entries?.filter((entry) => !onlyChanged || !('same' in entry)) ?? [];
    const sections = sectionsOf(shown, (entry) => sectionTitleOf(fields, layout, entry.key));

    return (
        <div className="k-compare-view">
            <section className="k-compare-view__main" aria-label="Differences">
                <div className="k-compare-view__bar">
                    <button type="button" className="k-versions__quiet k-compare-view__back" onClick={onBack}>
                        <ArrowLeft {...ICON} />
                        All versions
                    </button>
                    <p className="k-compare-view__what">
                        Comparing{' '}
                        <strong>
                            {chosen === undefined
                                ? `version ${compared}`
                                : `${titleOf(chosen)}, ${chosen.published ? 'live since' : 'saved'} ${savedAtOf(chosen.createdAt)}`}
                        </strong>{' '}
                        with <strong>the current draft</strong>
                    </p>
                    <div className="k-segmented" role="radiogroup" aria-label="Layout">
                        {(
                            [
                                ['side', 'Side by side'],
                                ['inline', 'Inline'],
                            ] satisfies Array<[DiffLayout, string]>
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                className="k-tab"
                                aria-checked={layoutChoice === key}
                                onClick={() => setLayoutChoice(key)}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <label className="k-compare-view__only">
                        <Checkbox.Root className="k-check" checked={onlyChanged} onCheckedChange={(checked) => setOnlyChanged(checked)}>
                            <Checkbox.Indicator className="k-check__indicator">
                                <Check {...ICON} />
                            </Checkbox.Indicator>
                        </Checkbox.Root>
                        Only changed fields
                    </label>
                </div>
                {entries === undefined ? (
                    <Loading problem={problem} />
                ) : shown.length === 0 ? (
                    <p className="k-help">This version holds what the draft holds.</p>
                ) : (
                    <DiffSections
                        sections={sections}
                        layout={layoutChoice}
                        beforeLabel={chosen === undefined ? `Version ${compared}` : titleOf(chosen)}
                        afterLabel="Current draft"
                    />
                )}
            </section>
            <aside className="k-compare-view__aside" aria-label="Versions">
                <h2 className="k-review-screen__heading">Compare with</h2>
                <ul className="k-compare-view__versions">
                    {listed.map((entry) => (
                        <li key={entry.version}>
                            <button
                                type="button"
                                className="k-compare-view__version"
                                aria-pressed={entry.version === compared}
                                onClick={() => onPick(entry.version)}>
                                <span className="k-compare-view__version-text">
                                    <span className="k-compare-view__version-title">{titleOf(entry)}</span>
                                    <span className="k-compare-view__version-when">
                                        {savedAtOf(entry.createdAt)} by {nameOf(entry.createdBy)}
                                    </span>
                                </span>
                                <span className="k-compare-view__version-state">{entry.published ? 'Live' : 'Draft'}</span>
                            </button>
                        </li>
                    ))}
                </ul>
                {showAll || others.length <= SHOWN_VERSIONS ? null : (
                    <button type="button" className="k-versions__quiet k-compare-view__more" onClick={() => setShowAll(true)}>
                        Show {others.length - SHOWN_VERSIONS} older {others.length - SHOWN_VERSIONS === 1 ? 'version' : 'versions'}
                    </button>
                )}
            </aside>
        </div>
    );
}
