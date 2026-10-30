import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Autocomplete } from '@base-ui/react/autocomplete';
import { Dialog } from '@base-ui/react/dialog';
import { Search } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { hrefOf, navigate, type CollectionSummary, type NavigationSection } from './navigation.js';
import {
    actionResultsOf,
    groupsOfResults,
    highlightOf,
    loadDocuments,
    placesOf,
    resultKeyOf,
    searchOf,
    type PaletteAction,
    type SearchGroup,
    type SearchResult,
} from './search.js';

export const onApple = (): boolean => /Mac|iPhone|iPad/.test(window.navigator.userAgent);

/**
 * Opens the palette on ⌘K, or Ctrl+K off a Mac, and closes it on a second
 * press.
 */
export const usePaletteShortcut = (toggle: () => void): void => {
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

/**
 * The sidebar's search button, which opens the palette. `compact` is the
 * phone bar's icon alone.
 */
export function SearchButton({ onOpen, compact = false }: { onOpen: () => void; compact?: boolean }) {
    if (compact) {
        return (
            <button type="button" className="k-icon-button k-phone-bar__button" aria-label="Search" aria-haspopup="dialog" onClick={onOpen}>
                <Search {...ICON} />
            </button>
        );
    }
    return (
        <button type="button" className="k-sidebar__search" aria-haspopup="dialog" onClick={onOpen}>
            <Search {...ICON} />
            <span className="k-sidebar__search-label">Search</span>
            <kbd className="k-sidebar__shortcut" aria-hidden="true">
                {onApple() ? '⌘K' : 'Ctrl K'}
            </kbd>
        </button>
    );
}

/**
 * The palette the search buttons and ⌘K open: every screen in the sidebar,
 * what the open screen can do under Actions, and every page and item by its
 * title, under its collection.
 */
export function CommandPalette({
    open,
    onOpenChange,
    connection,
    sections,
    collections,
    actions,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connection: Connection;
    sections: readonly NavigationSection[];
    collections: readonly CollectionSummary[] | undefined;
    /**
     * What the screen behind the palette offers as it stands, read each time
     * the palette opens.
     */
    actions: () => readonly PaletteAction[];
}) {
    const [query, setQuery] = useState('');
    const [documents, setDocuments] = useState<SearchResult[] | undefined>();
    const input = useRef<HTMLInputElement>(null);
    const highlighted = useRef<SearchResult | undefined>(undefined);

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

    // The screen's actions as they stood when the palette opened, since what they offer changes as the person works.
    const [offered, setOffered] = useState<SearchResult[]>([]);
    const readActions = useRef(actions);
    readActions.current = actions;
    useEffect(() => {
        if (open) setOffered(actionResultsOf(readActions.current()));
    }, [open]);

    const places = useMemo(() => placesOf(sections), [sections]);
    const groups = useMemo<SearchGroup[]>(
        () =>
            groupsOfResults(
                searchOf({
                    query,
                    places,
                    actions: offered,
                    documents: documents ?? [],
                })
            ),
        [query, places, offered, documents]
    );

    const change = (shown: boolean): void => {
        onOpenChange(shown);
        if (!shown) setQuery('');
    };

    const pick = (result: SearchResult, inNewTab: boolean): void => {
        if (!('screen' in result)) {
            change(false);
            // Once the palette has closed, so a dialog the action opens keeps the focus.
            window.requestAnimationFrame(result.run);
            return;
        }
        if (inNewTab) {
            window.open(hrefOf(result.screen), '_blank', 'noopener');
            return;
        }
        navigate(hrefOf(result.screen));
        change(false);
    };

    // ⌘↵, or Ctrl+↵ off a Mac, opens the highlighted result in a new tab.
    const openInNewTab = (event: KeyboardEvent<HTMLInputElement>): void => {
        if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || highlighted.current === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        pick(highlighted.current, true);
    };

    const searching = query.trim() !== '';
    const command = onApple() ? '⌘' : 'Ctrl';

    return (
        <Dialog.Root open={open} onOpenChange={change}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-palette" initialFocus={input}>
                    <Dialog.Title className="k-visually-hidden">Search the admin</Dialog.Title>
                    <Autocomplete.Root
                        open
                        inline
                        items={groups}
                        filter={null}
                        autoHighlight="always"
                        keepHighlight
                        itemToStringValue={(result: SearchResult) => result.label}
                        onItemHighlighted={(result: SearchResult | undefined) => {
                            highlighted.current = result;
                        }}
                        value={query}
                        onValueChange={(next, details) => {
                            if (details.reason !== 'item-press') setQuery(next);
                        }}>
                        <label className="k-palette__field">
                            <Search {...ICON} />
                            <Autocomplete.Input
                                ref={input}
                                aria-label="Search the admin"
                                placeholder="Search pages, collections and titles"
                                spellCheck={false}
                                onKeyDown={openInNewTab}
                            />
                            <kbd className="k-kbd k-palette__escape" aria-hidden="true">
                                esc
                            </kbd>
                        </label>
                        <div className="k-palette__results">
                            <Autocomplete.Empty>
                                <p className="k-palette__empty">
                                    {searching && documents === undefined ? 'Searching…' : 'Nothing matches'}
                                </p>
                            </Autocomplete.Empty>
                            <Autocomplete.List className="k-palette__list" aria-label="Results">
                                {(group: SearchGroup) => (
                                    <Autocomplete.Group key={group.label} items={group.items} className="k-palette__group">
                                        <Autocomplete.GroupLabel className="k-palette__heading">{group.label}</Autocomplete.GroupLabel>
                                        <Autocomplete.Collection>
                                            {(result: SearchResult) => (
                                                <Autocomplete.Item
                                                    key={resultKeyOf(result)}
                                                    value={result}
                                                    className="k-palette__option"
                                                    onClick={(event: MouseEvent) => pick(result, event.metaKey || event.ctrlKey)}>
                                                    <span className="k-ellipsis">
                                                        {highlightOf(result.label, query).map((part, index) =>
                                                            part.matched ? <strong key={index}>{part.text}</strong> : part.text
                                                        )}
                                                    </span>
                                                    {result.detail === '' ? null : (
                                                        <span className="k-palette__detail k-ellipsis">{result.detail}</span>
                                                    )}
                                                </Autocomplete.Item>
                                            )}
                                        </Autocomplete.Collection>
                                    </Autocomplete.Group>
                                )}
                            </Autocomplete.List>
                        </div>
                    </Autocomplete.Root>
                    <div className="k-palette__foot" aria-hidden="true">
                        <span>
                            <kbd className="k-kbd">↑</kbd>
                            <kbd className="k-kbd">↓</kbd>
                            Move
                        </span>
                        <span>
                            <kbd className="k-kbd">↵</kbd>
                            Open
                        </span>
                        <span>
                            <kbd className="k-kbd">{command}</kbd>
                            <kbd className="k-kbd">↵</kbd>
                            Open in a new tab
                        </span>
                        <span className="k-palette__foot-end">
                            <kbd className="k-kbd">{command}</kbd>
                            <kbd className="k-kbd">K</kbd>
                            Close
                        </span>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
