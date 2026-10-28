import { useCallback, useEffect, useMemo, useState } from 'react';
import { EditorContext, type EditorContextValue } from '../view/context.js';
import { Logo } from '../view/logo.js';
import { Avatar, usePeople } from '../view/people.js';
import type { AdminConfig } from './config.js';
import { connectOverHttp } from './connection.js';
import { Dashboard, type WaitingReview } from './dashboard.js';
import { DocumentScreen } from './document.js';
import { CollectionList, PagesList } from './list.js';
import {
    CONTENT_GROUP,
    hrefOf,
    isCurrent,
    navigationOf,
    screenOf,
    type CollectionSummary,
    type GlobalSummary,
    type Screen,
} from './navigation.js';
import { Loading } from './parts.js';

/**
 * The screen the address names, following it as it changes.
 */
const useScreen = (): Screen => {
    const [screen, setScreen] = useState<Screen>(() => screenOf(window.location.hash));
    useEffect(() => {
        const follow = (): void => setScreen(screenOf(window.location.hash));
        window.addEventListener('hashchange', follow);
        return () => window.removeEventListener('hashchange', follow);
    }, []);
    return screen;
};

/**
 * The system's light or dark, which the editor's tokens follow.
 */
const useSystemTheme = (): void => {
    useEffect(() => {
        const query = window.matchMedia('(prefers-color-scheme: light)');
        const apply = (): void => {
            window.document.documentElement.dataset['theme'] = query.matches ? 'light' : 'dark';
        };
        apply();
        query.addEventListener('change', apply);
        return () => query.removeEventListener('change', apply);
    }, []);
};

const open = (screen: Screen): void => {
    window.location.hash = hrefOf(screen);
};

/**
 * The admin: a sidebar of everything the editor may open, and the screen the
 * address names beside it.
 */
export function Admin({ config }: { config: AdminConfig }) {
    useSystemTheme();
    const connection = useMemo(() => connectOverHttp(config), [config]);
    const people = usePeople(connection);
    const screen = useScreen();
    const [globals, setGlobals] = useState<GlobalSummary[] | undefined>();
    const [collections, setCollections] = useState<CollectionSummary[] | undefined>();
    const [waiting, setWaiting] = useState<WaitingReview[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();

    const loadLists = useCallback(async (): Promise<void> => {
        const [listedGlobals, listedCollections] = await Promise.all([
            connection.call<{ globals: GlobalSummary[] }>('editing_globals_list'),
            connection.call<{ collections: CollectionSummary[] }>('editing_collections_list'),
        ]);
        if (listedGlobals.status !== 200 || listedCollections.status !== 200) {
            const failed = listedGlobals.status !== 200 ? listedGlobals : listedCollections;
            setProblem((failed.body as { detail?: string } | undefined)?.detail ?? `The CMS answered ${failed.status}.`);
            return;
        }
        setGlobals(listedGlobals.body.globals);
        setCollections(listedCollections.body.collections);
    }, [connection]);

    const loadWaiting = useCallback(async (): Promise<void> => {
        const answer = await connection.call<{ reviews: WaitingReview[] }>('editing_reviews_list', {
            query: {
                for: 'me',
            },
        });
        setWaiting(answer.status === 200 ? answer.body.reviews : []);
    }, [connection]);

    useEffect(() => {
        void loadLists();
        void loadWaiting();
    }, [loadLists, loadWaiting]);

    // A list or a count may have changed while the person was on another screen.
    useEffect(() => {
        if (screen.kind !== 'document') void loadLists();
    }, [screen, loadLists]);

    const sections = useMemo(
        () =>
            navigationOf({
                globals: globals ?? [],
                collections: collections ?? [],
                groups: config.groups,
            }),
        [globals, collections, config.groups]
    );

    const groupOf = (name: string): string => config.groups[name] ?? CONTENT_GROUP;
    const collectionLabel = (name: string): string | undefined => collections?.find((collection) => collection.name === name)?.label;
    const openDocument = (ref: string): void =>
        open({
            kind: 'document',
            ref,
        });

    const editorContext = useMemo<EditorContextValue>(
        () => ({
            connection,
            resolveUrl: (url) => {
                try {
                    return new URL(url, config.siteUrl ?? window.location.origin).toString();
                } catch {
                    return undefined;
                }
            },
            pageUrl: undefined,
        }),
        [connection, config.siteUrl]
    );

    const me = people === undefined ? undefined : people.people.find((person) => person.id === people.me);

    const shown = (() => {
        if (screen.kind === 'pages') return <PagesList connection={connection} />;
        if (screen.kind === 'collection') {
            const collection = collections?.find((candidate) => candidate.name === screen.name);
            if (collection === undefined) {
                return (
                    <div className="k-admin-body">
                        <Loading problem={collections === undefined ? problem : `There is no collection named ${screen.name}.`} />
                    </div>
                );
            }
            return (
                <CollectionList
                    key={collection.name}
                    connection={connection}
                    collection={collection}
                    group={groupOf(collection.name)}
                    onOpen={openDocument}
                />
            );
        }
        if (screen.kind === 'document') {
            return (
                <DocumentScreen
                    key={screen.ref}
                    connection={connection}
                    documentRef={screen.ref}
                    siteUrl={config.siteUrl}
                    people={people}
                    waiting={waiting ?? []}
                    collectionLabel={collectionLabel}
                    onReviewsChanged={() => void loadWaiting()}
                />
            );
        }
        return <Dashboard connection={connection} waiting={waiting} collections={collections} sections={sections} onOpen={openDocument} />;
    })();

    return (
        <EditorContext.Provider value={editorContext}>
            <div className="k-admin">
                <nav className="k-admin-nav" aria-label="Admin">
                    <a
                        className="k-admin-brand"
                        href={hrefOf({
                            kind: 'dashboard',
                        })}
                        aria-label="Dashboard">
                        <Logo />
                    </a>
                    <div className="k-admin-nav-groups">
                        <div className="k-admin-nav-group">
                            <a
                                className="k-admin-nav-item"
                                href={hrefOf({
                                    kind: 'dashboard',
                                })}
                                aria-current={screen.kind === 'dashboard' ? 'page' : undefined}>
                                <span className="k-ellipsis">Dashboard</span>
                                {waiting !== undefined && waiting.length > 0 ? (
                                    <span className="k-admin-count" aria-label={`${waiting.length} waiting for your review`}>
                                        {waiting.length}
                                    </span>
                                ) : null}
                            </a>
                        </div>
                        {sections.map((section) => (
                            <div key={section.label} className="k-admin-nav-group">
                                <h2 className="k-admin-heading">{section.label}</h2>
                                {section.entries.map((entry) => (
                                    <a
                                        key={hrefOf(entry.screen)}
                                        className="k-admin-nav-item"
                                        href={hrefOf(entry.screen)}
                                        aria-current={isCurrent(entry.screen, screen) ? 'page' : undefined}>
                                        <span className="k-ellipsis">{entry.label}</span>
                                    </a>
                                ))}
                            </div>
                        ))}
                    </div>
                    {me === undefined ? null : (
                        <div className="k-admin-nav-foot">
                            <Avatar person={me} size={26} />
                            <span className="k-ellipsis">{me.name}</span>
                        </div>
                    )}
                </nav>
                <main className="k-admin-main">{shown}</main>
            </div>
        </EditorContext.Provider>
    );
}
