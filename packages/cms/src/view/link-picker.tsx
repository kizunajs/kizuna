import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Library, LoaderCircle, Search, X } from 'lucide-react';
import { ICON, useEditorContext } from './context.js';
import { SAFE_HREF } from './schema.js';
import type { ControlProps } from './controls.js';

/**
 * A page or an item a content link may point at, as the link targets route
 * answers it.
 */
export interface LinkTarget {
    ref: string;
    label: string;
    site: string;
    siteLabel: string | null;
    siteIcon: string | null;
    path: string | null;
    status: 'published' | 'unpublished' | 'trashed' | 'missing';
    image?: string;
}

/**
 * What the picker says of a target a reader cannot open.
 */
const TARGET_STATUS_LABEL: Record<Exclude<LinkTarget['status'], 'published'>, string> = {
    unpublished: 'Not published',
    trashed: 'In trash',
    missing: 'Deleted',
};

/**
 * Searches the pages and items a content link may point at, or names the
 * refs given, through the link targets route.
 */
export const useLinkTargets = () => {
    const { connection } = useEditorContext();
    return useCallback(
        async (input: { q?: string; refs?: string[] }): Promise<LinkTarget[]> => {
            const answer = await connection.call<{ targets: LinkTarget[] }>('editing_link_targets', {
                query: input,
            });
            return answer.status === 200 ? answer.body.targets : [];
        },
        [connection]
    );
};

/**
 * The page or item behind each ref given, looked up again whenever the refs
 * change.
 */
export const useDescribedTargets = (refs: readonly string[]): ReadonlyMap<string, LinkTarget> => {
    const find = useLinkTargets();
    const key = [...new Set(refs)].sort().join(' ');
    const [described, setDescribed] = useState<ReadonlyMap<string, LinkTarget>>(new Map());
    useEffect(() => {
        if (key === '') {
            setDescribed(new Map());
            return;
        }
        let current = true;
        void find({
            refs: key.split(' '),
        }).then((targets) => {
            if (current) setDescribed(new Map(targets.map((target) => [target.ref, target])));
        });
        return () => {
            current = false;
        };
    }, [find, key]);
    return described;
};

/**
 * What a field says of a content link whose page or item a reader cannot
 * show, which renders as plain text until it is fixed.
 */
export const brokenNoteOf = (target: LinkTarget | undefined): string | undefined => {
    if (target === undefined) return undefined;
    if (target.status === 'unpublished') return `Link target unpublished: ${target.label}`;
    if (target.status === 'trashed') return `Link target in trash: ${target.label}`;
    if (target.status === 'missing') return `Link target deleted: ${target.label}`;
    return undefined;
};

/**
 * A target's site: its icon, or Shared's, and nothing without sites.
 */
export function LinkSiteMark({ target }: { target: Pick<LinkTarget, 'site' | 'siteLabel' | 'siteIcon'> }) {
    const { siteMark } = useEditorContext();
    if (target.siteLabel === null) return null;
    if (siteMark !== undefined) return <>{siteMark(target.site)}</>;
    if (target.siteIcon === null) {
        return (
            <span className="k-link-target__mark" aria-hidden="true">
                <Library {...ICON} />
            </span>
        );
    }
    return <img className="k-link-target__mark" src={target.siteIcon} alt="" width={16} height={16} />;
}

/**
 * One target in a row: its thumbnail, title, site mark and address.
 */
export function LinkTargetRow({ target }: { target: LinkTarget }) {
    const { resolveUrl } = useEditorContext();
    return (
        <span className="k-link-target">
            {target.image === undefined ? null : (
                <img className="k-link-target__thumb" src={resolveUrl(target.image)} alt="" width={28} height={28} />
            )}
            <LinkSiteMark target={target} />
            <span className="k-link-target__label k-ellipsis">{target.label}</span>
            {target.path === null ? null : <span className="k-link-target__path k-ellipsis">{target.path}</span>}
        </span>
    );
}

/**
 * A sheet from the right for picking the page or item a link goes to, on
 * any site or Shared: a search that answers as the editor types, and the
 * results with their thumbnail, site mark and address. Picking one closes
 * it.
 */
export function LinkTargetSheet({
    open,
    onOpenChange,
    onPick,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPick: (target: LinkTarget) => void;
}) {
    const find = useLinkTargets();
    const [query, setQuery] = useState('');
    const [scope, setScope] = useState<string | undefined>();
    const [results, setResults] = useState<LinkTarget[] | undefined>();
    const [sites, setSites] = useState<ReadonlyMap<string, LinkTarget>>(new Map());
    const [wasOpen, setWasOpen] = useState(false);

    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setQuery('');
            setScope(undefined);
            setResults(undefined);
        }
    }

    useEffect(() => {
        if (!open) return;
        let current = true;
        const timer = window.setTimeout(() => {
            void find({
                q: query.trim(),
            }).then((found) => {
                if (!current) return;
                setResults(found);
                setSites((previous) => {
                    const next = new Map(previous);
                    for (const target of found) if (target.siteLabel !== null && !next.has(target.site)) next.set(target.site, target);
                    return next;
                });
            });
        }, 150);
        return () => {
            current = false;
            window.clearTimeout(timer);
        };
    }, [open, query, find]);

    const shown = useMemo(() => (results ?? []).filter((target) => scope === undefined || target.site === scope), [results, scope]);

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-sheet k-reference-sheet">
                    <div className="k-sheet__head">
                        <Dialog.Title className="k-dialog__title k-reference-sheet__title">Choose a page</Dialog.Title>
                        <Dialog.Close className="k-icon-button" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    <label className="k-reference-sheet__search">
                        <Search {...ICON} />
                        <input
                            type="search"
                            className="k-input"
                            aria-label="Search pages"
                            placeholder="Search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                    {sites.size < 2 ? null : (
                        <div className="k-link-sheet__sites" role="radiogroup" aria-label="Site">
                            <button
                                type="button"
                                role="radio"
                                className="k-tab"
                                aria-checked={scope === undefined}
                                onClick={() => setScope(undefined)}>
                                All sites
                            </button>
                            {[...sites.values()].map((site) => (
                                <button
                                    key={site.site}
                                    type="button"
                                    role="radio"
                                    className="k-tab"
                                    aria-checked={scope === site.site}
                                    onClick={() => setScope(site.site)}>
                                    <LinkSiteMark target={site} />
                                    {site.siteLabel}
                                </button>
                            ))}
                        </div>
                    )}
                    {results === undefined ? (
                        <div className="k-reference-sheet__state">
                            <LoaderCircle {...ICON} className="k-spin" />
                        </div>
                    ) : shown.length === 0 ? (
                        <p className="k-help k-reference-sheet__state">
                            {query.trim() === '' ? 'There are no pages to choose from.' : `No pages match “${query.trim()}”.`}
                        </p>
                    ) : (
                        <ul className="k-reference-sheet__results" aria-label="Found pages">
                            {shown.map((target) => (
                                <li key={target.ref}>
                                    <button
                                        type="button"
                                        className="k-reference-sheet__result"
                                        onClick={() => {
                                            onPick(target);
                                            onOpenChange(false);
                                        }}>
                                        <LinkTargetRow target={target} />
                                        {target.status === 'published' ? null : (
                                            <span className="k-reference-sheet__detail">{TARGET_STATUS_LABEL[target.status]}</span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/**
 * A link field as stored: a page or an item by ref, or a URL, and the words
 * it shows.
 */
interface LinkValue {
    ref?: string;
    href?: string;
    label?: string;
}

/**
 * A link field: Page picks a page or an item on any site, URL takes one typed
 * by hand, and Label the words it shows, which default to the page's title.
 */
export function LinkControl({ value, onChange, disabled, id }: ControlProps) {
    const link = (value ?? {}) as LinkValue;
    const [mode, setMode] = useState<'page' | 'url'>(link.href !== undefined ? 'url' : 'page');
    const [picking, setPicking] = useState(false);
    const [url, setUrl] = useState(link.href ?? '');
    const targets = useDescribedTargets(link.ref === undefined ? [] : [link.ref]);
    const target = link.ref === undefined ? undefined : targets.get(link.ref);
    const urlProblem = url !== '' && !SAFE_HREF.test(url);
    const labelled = (next: { ref: string } | { href: string } | Record<string, never>): LinkValue => ({
        ...next,
        ...(link.label === undefined || link.label === ''
            ? {}
            : {
                  label: link.label,
              }),
    });
    const note = brokenNoteOf(target);
    return (
        <div className="k-link-field">
            <div className="k-link-field__row">
                <div className="k-segmented" role="radiogroup" aria-label="Link to">
                    {(
                        [
                            ['page', 'Page'],
                            ['url', 'URL'],
                        ] satisfies Array<[typeof mode, string]>
                    ).map(([choice, label]) => (
                        <button
                            key={choice}
                            type="button"
                            role="radio"
                            className="k-tab"
                            aria-checked={mode === choice}
                            disabled={disabled}
                            onClick={() => setMode(choice)}>
                            {label}
                        </button>
                    ))}
                </div>
                {mode === 'page' ? (
                    <button
                        type="button"
                        className="k-link-field__target"
                        disabled={disabled}
                        aria-label={link.ref === undefined ? 'Choose a page' : 'Change the page'}
                        onClick={() => setPicking(true)}>
                        {target !== undefined ? (
                            <LinkTargetRow target={target} />
                        ) : link.ref !== undefined ? (
                            <span className="k-ellipsis">{link.ref}</span>
                        ) : (
                            <span className="k-link-field__empty">Choose a page</span>
                        )}
                    </button>
                ) : (
                    <input
                        id={id}
                        className="k-input"
                        aria-label="URL"
                        aria-invalid={urlProblem}
                        placeholder="https://, /path or mailto:"
                        value={url}
                        disabled={disabled}
                        onChange={(event) => {
                            setUrl(event.target.value);
                            onChange(
                                labelled(
                                    event.target.value === ''
                                        ? {}
                                        : {
                                              href: event.target.value,
                                          }
                                )
                            );
                        }}
                    />
                )}
            </div>
            <input
                className="k-input"
                aria-label="Label"
                placeholder={target?.label ?? 'The words the link shows'}
                value={link.label ?? ''}
                disabled={disabled}
                onChange={(event) => {
                    const { label: _, ...rest } = link;
                    onChange(
                        event.target.value === ''
                            ? rest
                            : {
                                  ...rest,
                                  label: event.target.value,
                              }
                    );
                }}
            />
            {urlProblem && mode === 'url' ? (
                <p className="k-error" role="alert">
                    A link goes to https://, http://, mailto:, tel:, a path like /blog, or an #anchor.
                </p>
            ) : null}
            {note === undefined || mode !== 'page' ? null : <p className="k-help k-rich__broken">{note}</p>}
            <LinkTargetSheet
                open={picking}
                onOpenChange={setPicking}
                onPick={(picked) =>
                    onChange(
                        labelled({
                            ref: picked.ref,
                        })
                    )
                }
            />
        </div>
    );
}
