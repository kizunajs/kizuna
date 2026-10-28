import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Search } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { hrefOf, type CollectionSummary, type NavigationSection } from './navigation.js';
import { loadDocuments, placesOf, searchOf, type SearchResult } from './search.js';

const onApple = (): boolean => /Mac|iPhone|iPad/.test(window.navigator.userAgent);

/**
 * Opens the palette on ⌘K, or Ctrl+K off a Mac, and closes it on a second
 * press.
 */
const useShortcut = (toggle: () => void): void => {
    useEffect(() => {
        const listen = (event: globalThis.KeyboardEvent): void => {
            if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
            event.preventDefault();
            toggle();
        };
        window.addEventListener('keydown', listen);
        return () => window.removeEventListener('keydown', listen);
    }, [toggle]);
};

function ResultGroup({
    label,
    results,
    offset,
    active,
    optionId,
    onHover,
    onPick,
}: {
    label: string;
    results: readonly SearchResult[];
    offset: number;
    active: number;
    optionId: (index: number) => string;
    onHover: (index: number) => void;
    onPick: (result: SearchResult) => void;
}) {
    if (results.length === 0) return null;
    return (
        <div className="k-admin-palette-group" role="group" aria-label={label}>
            <p className="k-admin-palette-heading" aria-hidden="true">
                {label}
            </p>
            {results.map((result, index) => (
                <div
                    key={hrefOf(result.screen)}
                    id={optionId(offset + index)}
                    className="k-admin-palette-option"
                    role="option"
                    aria-selected={active === offset + index}
                    onMouseMove={() => onHover(offset + index)}
                    onClick={() => onPick(result)}>
                    <span className="k-ellipsis">{result.label}</span>
                    {result.detail === '' ? null : <span className="k-admin-palette-detail k-ellipsis">{result.detail}</span>}
                </div>
            ))}
        </div>
    );
}

/**
 * The sidebar's search, and the palette it opens: every screen in the
 * sidebar, and every page and item by its title.
 */
export function CommandPalette({
    connection,
    sections,
    collections,
}: {
    connection: Connection;
    sections: readonly NavigationSection[];
    collections: readonly CollectionSummary[] | undefined;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [documents, setDocuments] = useState<SearchResult[] | undefined>();
    const input = useRef<HTMLInputElement>(null);
    const listId = useId();
    const optionId = (index: number): string => `${listId}-${index}`;

    const toggle = useCallback(() => setOpen((shown) => !shown), []);
    useShortcut(toggle);

    // Titles change while the palette is closed, so each opening reads them again.
    useEffect(() => {
        if (!open || collections === undefined) return;
        let current = true;
        void loadDocuments(connection, collections).then((loaded) => {
            if (current) setDocuments(loaded);
        });
        return () => {
            current = false;
        };
    }, [open, connection, collections]);

    const places = useMemo(() => placesOf(sections), [sections]);
    const results = useMemo(
        () =>
            searchOf({
                query,
                places,
                documents: documents ?? [],
            }),
        [query, places, documents]
    );
    const flat = [...results.places, ...results.documents];
    const shownActive = Math.min(active, Math.max(0, flat.length - 1));

    const activeId = optionId(shownActive);
    useEffect(() => {
        window.document.getElementById(activeId)?.scrollIntoView({
            block: 'nearest',
        });
    }, [activeId, results]);

    const change = (shown: boolean): void => {
        setOpen(shown);
        if (!shown) {
            setQuery('');
            setActive(0);
        }
    };

    const pick = (result: SearchResult): void => {
        window.location.hash = hrefOf(result.screen);
        change(false);
    };

    const move = (event: KeyboardEvent<HTMLInputElement>): void => {
        if (flat.length === 0) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((shownActive + step + flat.length) % flat.length);
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setActive(event.key === 'Home' ? 0 : flat.length - 1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            pick(flat[shownActive]!);
        }
    };

    const searching = query.trim() !== '';

    return (
        <Dialog.Root open={open} onOpenChange={change}>
            <Dialog.Trigger className="k-admin-nav-search">
                <Search {...ICON} />
                <span className="k-admin-nav-search-label">Search</span>
                <kbd className="k-admin-kbd" aria-hidden="true">
                    {onApple() ? '⌘K' : 'Ctrl K'}
                </kbd>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-admin-palette" initialFocus={input}>
                    <Dialog.Title className="k-admin-visually-hidden">Search the admin</Dialog.Title>
                    <label className="k-admin-palette-field">
                        <Search {...ICON} />
                        <input
                            ref={input}
                            type="text"
                            role="combobox"
                            aria-label="Search the admin"
                            aria-expanded="true"
                            aria-controls={listId}
                            aria-autocomplete="list"
                            aria-activedescendant={flat.length === 0 ? undefined : optionId(shownActive)}
                            placeholder="Search pages, collections and titles"
                            autoComplete="off"
                            spellCheck={false}
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setActive(0);
                            }}
                            onKeyDown={move}
                        />
                    </label>
                    <div id={listId} className="k-admin-palette-results" role="listbox" aria-label="Results">
                        <ResultGroup
                            label="Go to"
                            results={results.places}
                            offset={0}
                            active={shownActive}
                            optionId={optionId}
                            onHover={setActive}
                            onPick={pick}
                        />
                        <ResultGroup
                            label="Documents"
                            results={results.documents}
                            offset={results.places.length}
                            active={shownActive}
                            optionId={optionId}
                            onHover={setActive}
                            onPick={pick}
                        />
                        {flat.length === 0 ? (
                            <p className="k-admin-palette-empty" role="status">
                                {searching && documents === undefined ? 'Searching…' : 'Nothing matches'}
                            </p>
                        ) : null}
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
