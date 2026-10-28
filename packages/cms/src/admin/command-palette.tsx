import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete } from '@base-ui/react/autocomplete';
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

interface ResultGroup {
    label: string;
    items: SearchResult[];
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
    const [documents, setDocuments] = useState<SearchResult[] | undefined>();
    const input = useRef<HTMLInputElement>(null);

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
    const groups = useMemo<ResultGroup[]>(() => {
        const results = searchOf({
            query,
            places,
            documents: documents ?? [],
        });
        return [
            {
                label: 'Go to',
                items: results.places,
            },
            {
                label: 'Documents',
                items: results.documents,
            },
        ].filter((group) => group.items.length > 0);
    }, [query, places, documents]);

    const change = (shown: boolean): void => {
        setOpen(shown);
        if (!shown) setQuery('');
    };

    const pick = (result: SearchResult): void => {
        window.location.hash = hrefOf(result.screen);
        change(false);
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
                    <Autocomplete.Root
                        open
                        inline
                        items={groups}
                        filter={null}
                        autoHighlight="always"
                        keepHighlight
                        itemToStringValue={(result: SearchResult) => result.label}
                        value={query}
                        onValueChange={(next, details) => {
                            if (details.reason !== 'item-press') setQuery(next);
                        }}>
                        <label className="k-admin-palette-field">
                            <Search {...ICON} />
                            <Autocomplete.Input
                                ref={input}
                                aria-label="Search the admin"
                                placeholder="Search pages, collections and titles"
                                spellCheck={false}
                            />
                        </label>
                        <div className="k-admin-palette-results">
                            <Autocomplete.Empty>
                                <p className="k-admin-palette-empty">
                                    {searching && documents === undefined ? 'Searching…' : 'Nothing matches'}
                                </p>
                            </Autocomplete.Empty>
                            <Autocomplete.List className="k-admin-palette-list" aria-label="Results">
                                {(group: ResultGroup) => (
                                    <Autocomplete.Group key={group.label} items={group.items} className="k-admin-palette-group">
                                        <Autocomplete.GroupLabel className="k-admin-palette-heading">{group.label}</Autocomplete.GroupLabel>
                                        <Autocomplete.Collection>
                                            {(result: SearchResult) => (
                                                <Autocomplete.Item
                                                    key={hrefOf(result.screen)}
                                                    value={result}
                                                    className="k-admin-palette-option"
                                                    onClick={() => pick(result)}>
                                                    <span className="k-ellipsis">{result.label}</span>
                                                    {result.detail === '' ? null : (
                                                        <span className="k-admin-palette-detail k-ellipsis">{result.detail}</span>
                                                    )}
                                                </Autocomplete.Item>
                                            )}
                                        </Autocomplete.Collection>
                                    </Autocomplete.Group>
                                )}
                            </Autocomplete.List>
                        </div>
                    </Autocomplete.Root>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
