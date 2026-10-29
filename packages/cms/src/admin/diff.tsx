import { useEffect, useState, type ReactNode } from 'react';
import { useEditorContext } from '../view/context.js';
import type { ChangeView, Shown } from '../view/change-value.js';
import type { MediaRecord } from '../view/media.js';
import type { Section } from './sections.js';

/**
 * How a change shows: what it was and what it becomes in two columns, or
 * both in one line.
 */
export type DiffLayout = 'side' | 'inline';

/**
 * One field in a comparison: what changed about it, or how it reads on both
 * sides when nothing did.
 */
export type DiffEntry = {
    key: string;
    label: string;
    /**
     * A word beside the label, like "Unchanged".
     */
    note?: string;
} & (
    | {
          view: ChangeView;
      }
    | {
          same: Shown;
      }
);

type Side = 'before' | 'after';

/**
 * An image, small, with its file name. Until the library answers, the box
 * holds its place.
 */
function MediaThumb({ id, alt }: { id: string; alt: string | undefined }) {
    const { connection, resolveUrl } = useEditorContext();
    const [record, setRecord] = useState<MediaRecord | undefined>();
    useEffect(() => {
        let current = true;
        void connection
            .call<MediaRecord>('editing_media_get', {
                params: {
                    id,
                },
            })
            .then((answer) => {
                if (current && answer.status === 200) setRecord(answer.body);
            });
        return () => {
            current = false;
        };
    }, [connection, id]);
    const source = record === undefined ? undefined : resolveUrl(`${record.url}?w=240`);
    return (
        <span className="k-diff__image">
            {source === undefined ? <span className="k-diff__thumb" /> : <img className="k-diff__thumb" src={source} alt="" />}
            <span className="k-diff__file">{record?.filename ?? alt ?? 'Image'}</span>
        </span>
    );
}

/**
 * A value as it reads in a comparison.
 */
function ShownValue({ shown }: { shown: Shown }): ReactNode {
    if (shown.kind === 'empty') return <span className="k-diff__empty">Empty</span>;
    if (shown.kind === 'image') return <MediaThumb id={shown.id} alt={shown.alt} />;
    if (shown.kind === 'text') return <span className="k-diff__text">{shown.text}</span>;
    if (shown.kind === 'list') {
        if (shown.items.length === 0) return <span className="k-diff__empty">Empty</span>;
        return (
            <ul className="k-diff__items">
                {shown.items.map((item, index) => (
                    <li key={index} className="k-diff__item">
                        <ShownValue shown={item} />
                    </li>
                ))}
            </ul>
        );
    }
    return (
        <dl className="k-diff__fields">
            {shown.entries.map((entry) => (
                <div key={entry.label} className="k-diff__field">
                    <dt>{entry.label}</dt>
                    <dd>
                        <ShownValue shown={entry.value} />
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * One side of a change: what it was, with what went struck through, or what
 * it becomes, with what came marked.
 */
function SideOf({ view, side }: { view: ChangeView; side: Side }): ReactNode {
    if (view.kind === 'words') {
        return (
            <p className="k-diff__prose">
                {view.pieces
                    .filter((piece) => piece.kind !== (side === 'before' ? 'added' : 'removed'))
                    .map((piece, index) =>
                        piece.kind === 'same' ? (
                            <span key={index}>{piece.text}</span>
                        ) : piece.kind === 'added' ? (
                            <ins key={index}>{piece.text}</ins>
                        ) : (
                            <del key={index}>{piece.text}</del>
                        )
                    )}
            </p>
        );
    }
    if (view.kind === 'replace') {
        const shown = side === 'before' ? view.before : view.after;
        if (shown.kind === 'empty') return <ShownValue shown={shown} />;
        const Mark = side === 'before' ? 'del' : 'ins';
        return (
            <Mark className="k-diff__whole">
                <ShownValue shown={shown} />
            </Mark>
        );
    }
    if (view.kind === 'image') {
        return (
            <div className="k-diff__settings">
                <MediaThumb id={view.image.id} alt={view.image.alt} />
                {side === 'after' ? (
                    <ul className="k-diff__facts">
                        {view.facts.map((fact) => (
                            <li key={fact}>{fact}</li>
                        ))}
                    </ul>
                ) : null}
            </div>
        );
    }
    if (view.kind === 'list') {
        const items =
            side === 'before'
                ? view.before.map((item) => ({
                      value: item.value,
                      change: item.removed ? 'removed' : undefined,
                  }))
                : view.items.map((item) => ({
                      value: item.value,
                      change: item.added ? 'added' : undefined,
                  }));
        if (items.length === 0) return <span className="k-diff__empty">Empty</span>;
        return (
            <ul className="k-diff__items">
                {items.map((item, index) => (
                    <li key={index} className="k-diff__item" data-change={item.change}>
                        <ShownValue shown={item.value} />
                    </li>
                ))}
            </ul>
        );
    }
    return (
        <dl className="k-diff__fields">
            {view.entries.map((entry) => (
                <div key={entry.label} className="k-diff__field">
                    <dt>{entry.label}</dt>
                    <dd>
                        <SideOf view={entry.change} side={side} />
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * A change in one line: what went struck through, then what came.
 */
function InlineOf({ view }: { view: ChangeView }): ReactNode {
    if (view.kind === 'words') {
        return (
            <p className="k-diff__prose">
                {view.pieces.map((piece, index) =>
                    piece.kind === 'same' ? (
                        <span key={index}>{piece.text}</span>
                    ) : piece.kind === 'added' ? (
                        <ins key={index}>{piece.text}</ins>
                    ) : (
                        <del key={index}>{piece.text}</del>
                    )
                )}
            </p>
        );
    }
    if (view.kind === 'replace') {
        return (
            <div className="k-diff__swap">
                {view.before.kind === 'empty' ? null : (
                    <del className="k-diff__whole">
                        <ShownValue shown={view.before} />
                    </del>
                )}
                {view.after.kind === 'empty' ? (
                    <span className="k-diff__empty">Cleared</span>
                ) : (
                    <ins className="k-diff__whole">
                        <ShownValue shown={view.after} />
                    </ins>
                )}
            </div>
        );
    }
    if (view.kind === 'image') return <SideOf view={view} side="after" />;
    if (view.kind === 'list') {
        const items = [
            ...view.items.map((item) => ({
                value: item.value,
                change: item.added ? 'added' : undefined,
            })),
            ...view.removed.map((value) => ({
                value,
                change: 'removed',
            })),
        ];
        if (items.length === 0) return <span className="k-diff__empty">Empty</span>;
        return (
            <ul className="k-diff__items">
                {items.map((item, index) => (
                    <li key={index} className="k-diff__item" data-change={item.change}>
                        <ShownValue shown={item.value} />
                    </li>
                ))}
            </ul>
        );
    }
    return (
        <dl className="k-diff__fields">
            {view.entries.map((entry) => (
                <div key={entry.label} className="k-diff__field">
                    <dt>{entry.label}</dt>
                    <dd>
                        <InlineOf view={entry.change} />
                    </dd>
                </div>
            ))}
        </dl>
    );
}

function DiffRow({
    entry,
    layout,
    beforeLabel,
    afterLabel,
}: {
    entry: DiffEntry;
    layout: DiffLayout;
    beforeLabel: string;
    afterLabel: string;
}) {
    const same = 'same' in entry;
    return (
        <div className="k-diff__row" data-unchanged={same || undefined}>
            <div className="k-diff__head">
                <span className="k-diff__label">{entry.label}</span>
                {entry.note === undefined ? null : <span className="k-diff__note">{entry.note}</span>}
            </div>
            {layout === 'side' ? (
                <div className="k-diff__sides">
                    <div className="k-diff__before" role="group" aria-label={beforeLabel}>
                        {same ? <ShownValue shown={entry.same} /> : <SideOf view={entry.view} side="before" />}
                    </div>
                    <div className="k-diff__after" role="group" aria-label={afterLabel}>
                        {same ? <ShownValue shown={entry.same} /> : <SideOf view={entry.view} side="after" />}
                    </div>
                </div>
            ) : (
                <div className="k-diff__inline">{same ? <ShownValue shown={entry.same} /> : <InlineOf view={entry.view} />}</div>
            )}
        </div>
    );
}

/**
 * Fields compared section by section, under the names of the two sides when
 * they sit side by side.
 */
export function DiffSections({
    sections,
    layout,
    beforeLabel,
    afterLabel,
}: {
    sections: readonly Section<DiffEntry>[];
    layout: DiffLayout;
    beforeLabel: string;
    afterLabel: string;
}) {
    return (
        <div className="k-diff">
            {layout === 'side' ? (
                <div className="k-diff__columns" aria-hidden="true">
                    <span>{beforeLabel}</span>
                    <span>{afterLabel}</span>
                </div>
            ) : null}
            {sections.map((section) => (
                <section key={section.title} className="k-diff__section" aria-label={section.title === '' ? undefined : section.title}>
                    {section.title === '' ? null : <h2 className="k-diff__title">{section.title}</h2>}
                    {section.entries.map((entry) => (
                        <DiffRow key={entry.key} entry={entry} layout={layout} beforeLabel={beforeLabel} afterLabel={afterLabel} />
                    ))}
                </section>
            ))}
        </div>
    );
}
