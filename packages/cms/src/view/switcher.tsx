import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { ChevronDown, LoaderCircle, Plus, Search } from 'lucide-react';
import type { Connection } from './connection.js';
import { ICON } from './context.js';

interface PageEntry {
    ref: string;
    name: string;
    label: string | null;
    path: string;
    status: string;
}

interface GlobalEntry {
    name: string;
    label: string | null;
    status: string;
}

interface ItemEntry {
    ref: string;
    label: string;
    path: string | null;
    status: string;
}

interface CollectionEntry {
    name: string;
    label: string;
    count: number;
    items?: ItemEntry[];
}

const STATUS: Record<string, string> = {
    empty: 'Empty',
    draft: 'Draft',
    published: 'Published',
    changed: 'Unpublished changes',
};

const written = (name: string): string =>
    name
        .replace(/Page$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

const matches = (query: string, ...texts: Array<string | null>): boolean =>
    query === '' || texts.some((text) => text !== null && text.toLowerCase().includes(query));

export interface SwitcherProps {
    connection: Connection;
    /**
     * The open document, which the list marks.
     */
    current: string;
    title: string;
    /**
     * Opens a document, on its page in the preview when it has one.
     */
    onOpen: (target: { ref: string; path: string | null }) => void;
}

/**
 * The document's name, which opens every page and every collection's items
 * to jump to, with a way to add an item.
 */
export function Switcher({ connection, current, title, onOpen }: SwitcherProps) {
    const [open, setOpen] = useState(false);
    const [pages, setPages] = useState<PageEntry[] | undefined>();
    const [globals, setGlobals] = useState<GlobalEntry[] | undefined>();
    const [collections, setCollections] = useState<CollectionEntry[] | undefined>();
    const [query, setQuery] = useState('');
    const [creating, setCreating] = useState<string | undefined>();
    const [problem, setProblem] = useState<string | undefined>();

    useEffect(() => {
        if (!open) return;
        setQuery('');
        setProblem(undefined);
        void connection.call<{ pages: PageEntry[] }>('editing_pages_list').then((answer) => {
            if (answer.status === 200) setPages(answer.body.pages.filter((page) => page.ref.startsWith('page:')));
        });
        void connection.call<{ globals: GlobalEntry[] }>('editing_globals_list').then((answer) => {
            setGlobals(answer.status === 200 ? answer.body.globals : []);
        });
        void connection.call<{ collections: CollectionEntry[] }>('editing_collections_list').then(async (answer) => {
            if (answer.status !== 200) return;
            const listed = await Promise.all(
                answer.body.collections.map(async (collection) => {
                    const items = await connection.call<{ items: ItemEntry[] }>('editing_collections_list_items', {
                        params: {
                            name: collection.name,
                        },
                    });
                    return {
                        ...collection,
                        items: items.status === 200 ? items.body.items : [],
                    };
                })
            );
            setCollections(listed);
        });
    }, [open, connection]);

    const search = query.trim().toLowerCase();
    const shownPages = useMemo(
        () => (pages ?? []).filter((page) => matches(search, page.label ?? written(page.name), page.path)),
        [pages, search]
    );
    const shownGlobals = (globals ?? []).filter((global) => matches(search, global.label ?? written(global.name)));

    const go = (target: { ref: string; path: string | null }): void => {
        setOpen(false);
        onOpen(target);
    };

    const create = async (collection: CollectionEntry): Promise<void> => {
        setCreating(collection.name);
        setProblem(undefined);
        const answer = await connection.call<{ ref: string; path: string | null }>('editing_collections_create_item', {
            params: {
                name: collection.name,
            },
            body: {},
        });
        setCreating(undefined);
        if (answer.status !== 201) {
            setProblem((answer.body as { detail?: string } | undefined)?.detail ?? `The item was not added (${answer.status}).`);
            return;
        }
        go({
            ref: answer.body.ref,
            path: null,
        });
    };

    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className="k-switch-trigger" aria-label={`${title}, open another page or item`}>
                <span className="k-title-name">{title}</span>
                <ChevronDown {...ICON} />
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-switcher">
                    <Dialog.Title className="k-dialog-title">Open</Dialog.Title>
                    <label className="k-switcher-search">
                        <Search {...ICON} />
                        <input
                            type="search"
                            placeholder="Find a page or item"
                            value={query}
                            autoFocus
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                    <div className="k-switcher-list">
                        {pages === undefined || collections === undefined || globals === undefined ? (
                            <p className="k-help">
                                <LoaderCircle {...ICON} className="k-spin" /> Listing the content
                            </p>
                        ) : (
                            <>
                                {shownPages.length > 0 ? (
                                    <section className="k-switcher-group">
                                        <h3 className="k-switcher-heading">Pages</h3>
                                        {shownPages.map((page) => (
                                            <button
                                                key={page.ref}
                                                type="button"
                                                className="k-switcher-row"
                                                aria-current={page.ref === current}
                                                onClick={() =>
                                                    go({
                                                        ref: page.ref,
                                                        path: page.path,
                                                    })
                                                }>
                                                <span className="k-switcher-name">{page.label ?? written(page.name)}</span>
                                                <span className="k-switcher-path">{page.path}</span>
                                                <span className="k-switcher-status">{STATUS[page.status] ?? page.status}</span>
                                            </button>
                                        ))}
                                    </section>
                                ) : null}
                                {shownGlobals.length > 0 ? (
                                    <section className="k-switcher-group">
                                        <h3 className="k-switcher-heading">On every page</h3>
                                        {shownGlobals.map((global) => (
                                            <button
                                                key={global.name}
                                                type="button"
                                                className="k-switcher-row"
                                                aria-current={`global:${global.name}` === current}
                                                onClick={() =>
                                                    go({
                                                        ref: `global:${global.name}`,
                                                        path: null,
                                                    })
                                                }>
                                                <span className="k-switcher-name">{global.label ?? written(global.name)}</span>
                                                <span className="k-switcher-status">{STATUS[global.status] ?? global.status}</span>
                                            </button>
                                        ))}
                                    </section>
                                ) : null}
                                {collections.map((collection) => {
                                    const items = (collection.items ?? []).filter((item) => matches(search, item.label, item.path));
                                    if (search !== '' && items.length === 0) return null;
                                    return (
                                        <section key={collection.name} className="k-switcher-group">
                                            <div className="k-switcher-heading-row">
                                                <h3 className="k-switcher-heading">
                                                    {collection.label} · {collection.count}
                                                </h3>
                                                <button
                                                    type="button"
                                                    className="k-button k-button-secondary k-button-small"
                                                    disabled={creating !== undefined}
                                                    onClick={() => void create(collection)}>
                                                    {creating === collection.name ? (
                                                        <LoaderCircle {...ICON} className="k-spin" />
                                                    ) : (
                                                        <Plus {...ICON} />
                                                    )}
                                                    New
                                                </button>
                                            </div>
                                            {items.map((item) => (
                                                <button
                                                    key={item.ref}
                                                    type="button"
                                                    className="k-switcher-row"
                                                    aria-current={item.ref === current}
                                                    onClick={() =>
                                                        go({
                                                            ref: item.ref,
                                                            path: item.path,
                                                        })
                                                    }>
                                                    <span className="k-switcher-name">{item.label}</span>
                                                    <span className="k-switcher-status">{STATUS[item.status] ?? item.status}</span>
                                                </button>
                                            ))}
                                            {items.length === 0 ? <p className="k-help">No items yet.</p> : null}
                                        </section>
                                    );
                                })}
                            </>
                        )}
                    </div>
                    {problem !== undefined ? (
                        <p className="k-error" role="alert">
                            {problem}
                        </p>
                    ) : null}
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
