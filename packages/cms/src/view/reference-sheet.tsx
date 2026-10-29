import { useCallback, useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Check, LoaderCircle, Search, X } from 'lucide-react';
import { ICON, useEditorContext } from './context.js';

/**
 * One id a branded field may hold, as the CMS's search answers it.
 */
export interface SearchResult {
    id: string;
    label: string;
    image?: string;
    /**
     * A short line beside the label, like a price.
     */
    detail?: string;
}

/**
 * Searches the ids of a brand, or names the ones given, through the CMS's
 * search route.
 */
export const useItemSearch = (brand: string | undefined) => {
    const { connection } = useEditorContext();
    return useCallback(
        async (input: { q?: string; ids?: string[] }): Promise<SearchResult[]> => {
            if (brand === undefined) return [];
            const answer = await connection.call<{ items: SearchResult[] }>('editing_search_items', {
                params: {
                    brand,
                },
                query: input,
            });
            return answer.status === 200 ? answer.body.items : [];
        },
        [connection, brand]
    );
};

/**
 * How many chosen ids a list's sheet counts, against the most it may hold.
 */
export const chosenCountOf = (count: number, max: number | undefined): string =>
    max === undefined ? `${count} chosen` : `${count} of ${max} chosen`;

/**
 * The words on the button that applies the sheet: "Use 3 products", or
 * "Use 1 product".
 */
export const applyLabelOf = (count: number, noun: { one: string; many: string }): string =>
    `Use ${count} ${count === 1 ? noun.one : noun.many}`;

/**
 * The ids with one added at the end or taken out, never past `max`.
 */
export const toggledIds = (ids: readonly string[], id: string, max: number | undefined): string[] => {
    if (ids.includes(id)) return ids.filter((candidate) => candidate !== id);
    if (max !== undefined && ids.length >= max) return [...ids];
    return [...ids, id];
};

/**
 * A sheet from the right for picking the ids a list holds: a search that
 * answers as the editor types, the results with their thumbnail and detail,
 * and what is chosen so far as chips. Nothing changes on the field until
 * the editor applies the choice.
 */
export function ReferenceSheet({
    open,
    onOpenChange,
    brand,
    chosen,
    named,
    max,
    noun,
    onApply,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    brand: string;
    chosen: readonly string[];
    /**
     * What the field already knows of its ids, so the chips name them.
     */
    named: ReadonlyMap<string, SearchResult>;
    max: number | undefined;
    noun: {
        one: string;
        many: string;
    };
    onApply: (ids: string[], named: ReadonlyMap<string, SearchResult>) => void;
}) {
    const { resolveUrl } = useEditorContext();
    const search = useItemSearch(brand);
    const [draft, setDraft] = useState<string[]>([]);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[] | undefined>();
    const [known, setKnown] = useState<ReadonlyMap<string, SearchResult>>(new Map());
    const [wasOpen, setWasOpen] = useState(false);

    // Each opening starts from what the field holds.
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setDraft([...chosen]);
            setQuery('');
            setResults(undefined);
            setKnown(new Map(named));
        }
    }

    useEffect(() => {
        if (!open) return;
        let current = true;
        const timer = window.setTimeout(() => {
            void search({
                q: query.trim(),
            }).then((found) => {
                if (!current) return;
                setResults(found);
                setKnown((previous) => new Map([...previous, ...found.map((result): [string, SearchResult] => [result.id, result])]));
            });
        }, 150);
        return () => {
            current = false;
            window.clearTimeout(timer);
        };
    }, [open, query, search]);

    const full = max !== undefined && draft.length >= max;

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-sheet k-reference-sheet">
                    <div className="k-sheet__head">
                        <Dialog.Title className="k-dialog__title k-reference-sheet__title">Choose {noun.many}</Dialog.Title>
                        <Dialog.Close className="k-icon-button" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    <label className="k-reference-sheet__search">
                        <Search {...ICON} />
                        <input
                            type="search"
                            className="k-input"
                            aria-label={`Search ${noun.many}`}
                            placeholder="Search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                    <div className="k-reference-sheet__chips" aria-label="Chosen">
                        {draft.length === 0 ? (
                            <span className="k-help">Nothing chosen yet</span>
                        ) : (
                            draft.map((id) => {
                                const label = known.get(id)?.label ?? id;
                                return (
                                    <span key={id} className="k-chip">
                                        <span className="k-ellipsis">{label}</span>
                                        <button
                                            type="button"
                                            className="k-chip__remove"
                                            aria-label={`Remove ${label}`}
                                            onClick={() => setDraft(draft.filter((candidate) => candidate !== id))}>
                                            <X {...ICON} />
                                        </button>
                                    </span>
                                );
                            })
                        )}
                    </div>
                    {results === undefined ? (
                        <div className="k-reference-sheet__state">
                            <LoaderCircle {...ICON} className="k-spin" />
                        </div>
                    ) : results.length === 0 ? (
                        <p className="k-help k-reference-sheet__state">
                            {query.trim() === '' ? `There are no ${noun.many} to choose from.` : `No ${noun.many} match “${query.trim()}”.`}
                        </p>
                    ) : (
                        <ul className="k-reference-sheet__results" aria-label={`Found ${noun.many}`}>
                            {results.map((result) => {
                                const on = draft.includes(result.id);
                                return (
                                    <li key={result.id}>
                                        <button
                                            type="button"
                                            role="checkbox"
                                            aria-checked={on}
                                            aria-disabled={!on && full ? true : undefined}
                                            className="k-reference-sheet__result"
                                            onClick={() => setDraft(toggledIds(draft, result.id, max))}>
                                            <span className="k-reference-sheet__box" data-on={on} aria-hidden="true">
                                                {on ? <Check {...ICON} /> : null}
                                            </span>
                                            {result.image === undefined ? (
                                                <span className="k-reference-sheet__thumb" aria-hidden="true" />
                                            ) : (
                                                <img className="k-reference-sheet__thumb" src={resolveUrl(result.image)} alt="" />
                                            )}
                                            <span className="k-reference-sheet__label k-ellipsis">{result.label}</span>
                                            {result.detail === undefined ? null : (
                                                <span className="k-reference-sheet__detail">{result.detail}</span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <div className="k-reference-sheet__foot">
                        <span className="k-reference-sheet__count" role="status">
                            {chosenCountOf(draft.length, max)}
                        </span>
                        <Dialog.Close className="k-button k-button--secondary">Cancel</Dialog.Close>
                        <button
                            type="button"
                            className="k-button k-button--primary"
                            onClick={() => {
                                onApply(draft, known);
                                onOpenChange(false);
                            }}>
                            {applyLabelOf(draft.length, noun)}
                        </button>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
