import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Toast } from '@base-ui/react/toast';
import {
    ChevronDown,
    ChevronRight,
    File,
    FileText,
    Image,
    LayoutGrid,
    List,
    Menu as MenuIcon,
    Table2,
    X,
    type LucideIcon,
} from 'lucide-react';
import { EditorContext, ICON, type EditorContextValue } from '../view/context.js';
import { singularOf } from '../view/array-rows.js';
import { humanize } from '../view/schema.js';
import { Logo } from '../view/logo.js';
import { usePeople } from '../view/people.js';
import { CommandPalette, SearchButton, usePaletteShortcut } from './command-palette.js';
import type { AdminConfig, AdminSite } from './config.js';
import { connectOverHttp, withSiteCollections } from './connection.js';
import { Dashboard, type WaitingReview } from './dashboard.js';
import { DocumentScreen } from './document.js';
import { EditInChat } from './edit-in-chat.js';
import { CollectionList, PagesList, createItem } from './list.js';
import { MediaLibrary } from './media.js';
import {
    CONTENT_GROUP,
    MANY_SITES,
    hrefIn,
    hrefOf,
    inAppTargetOf,
    isCurrent,
    navigate,
    navigationOf,
    replaceAddress,
    screenInSite,
    screenOf,
    showSite,
    useAddress,
    tabTitleOf,
    type CollectionSummary,
    type GlobalSummary,
    type Screen,
} from './navigation.js';
import { Loading } from './parts.js';
import { PageHeader } from './page-header.js';
import { SignedIn } from './signed-in.js';
import { SiteFact, SiteSwitcher, SiteTabs } from './site-switcher.js';
import { sharedNameOf, siteValuesRefOf } from './site-view.js';
import { NotFound, shownAddress } from './states.js';
import { useTabIcon } from './tab-icon.js';
import { useTheme } from './theme.js';
import { useOfferUndo } from './toasts.js';
import type { PaletteAction } from './search.js';
import { RecordScreen, ViewList } from './view-screen.js';
import type { ViewSummary } from './views.js';

/**
 * The screen the address names, following it as it changes.
 */
const useScreen = (): Screen => {
    const { pathname } = useAddress();
    return useMemo(() => screenOf(pathname), [pathname]);
};

/**
 * Opens the admin's own links in place, so moving between screens keeps the
 * page loaded. Each is still a real link, which a middle click or ⌘-click
 * opens in a tab of its own.
 */
const useLinksInPlace = (): void => {
    useEffect(() => {
        const follow = (event: MouseEvent): void => {
            const target = inAppTargetOf(event);
            if (target === undefined) return;
            event.preventDefault();
            navigate(target);
        };
        window.document.addEventListener('click', follow);
        return () => window.document.removeEventListener('click', follow);
    }, []);
};

/**
 * The width under which the sidebar folds behind the phone bar's menu button.
 */
const PHONE = '(max-width: 860px)';

/**
 * Whether the window is as narrow as a phone, following it as it changes.
 */
const usePhone = (): boolean => {
    const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches);
    useEffect(() => {
        const query = window.matchMedia(PHONE);
        const follow = (): void => setPhone(query.matches);
        follow();
        query.addEventListener('change', follow);
        return () => query.removeEventListener('change', follow);
    }, []);
    return phone;
};

const open = (screen: Screen): void => navigate(hrefOf(screen));

/**
 * The icon a sidebar entry shows with several sites, so pages, collections
 * and globals read apart under each heading.
 */
const entryIconOf = (screen: Screen): LucideIcon | undefined => {
    if (screen.kind === 'dashboard') return LayoutGrid;
    if (screen.kind === 'pages') return File;
    if (screen.kind === 'collection') return List;
    if (screen.kind === 'media') return Image;
    if (screen.kind === 'view') return Table2;
    if (screen.kind === 'document') return FileText;
    return undefined;
};

const FOLDED_KEY = 'kizuna-cms:folded-sites';

/**
 * The sites whose group the editor folded in All sites, kept for the next
 * visit. With many sites every group starts folded.
 */
const readFolded = (sites: readonly AdminSite[]): Set<string> => {
    try {
        const stored = window.localStorage.getItem(FOLDED_KEY);
        if (stored !== null) return new Set(JSON.parse(stored) as string[]);
    } catch {
        // Storage may be blocked, which leaves the default.
    }
    return new Set(sites.length > MANY_SITES ? sites.map((site) => site.key) : []);
};

const saveFolded = (folded: ReadonlySet<string>): void => {
    try {
        window.localStorage.setItem(FOLDED_KEY, JSON.stringify([...folded]));
    } catch {
        // Storage may be blocked, so folding lasts the visit.
    }
};

/**
 * The screens every site shares an address for, which All sites shows.
 */
const showsEverySite = (screen: Screen): boolean => screen.site === undefined && (screen.kind === 'dashboard' || screen.kind === 'pages');

/**
 * The admin: a sidebar of everything the editor may open, and the screen the
 * address names beside it. On a phone the sidebar opens as a sheet from the
 * bar's menu button.
 */
export function Admin({ config }: { config: AdminConfig }) {
    const [theme, chooseTheme] = useTheme();
    const connection = useMemo(() => connectOverHttp(config), [config]);
    const people = usePeople(connection);
    const screen = useScreen();
    useLinksInPlace();
    const phone = usePhone();
    const [searching, setSearching] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    usePaletteShortcut(useCallback(() => setSearching((shown) => !shown), []));

    // Opening a screen from the sheet closes it.
    useEffect(() => {
        setMenuOpen(false);
    }, [screen]);

    const openSearch = (): void => {
        setMenuOpen(false);
        setSearching(true);
    };
    const [globals, setGlobals] = useState<GlobalSummary[] | undefined>();
    const [collections, setCollections] = useState<CollectionSummary[] | undefined>();
    const [waiting, setWaiting] = useState<WaitingReview[] | undefined>();
    const [views, setViews] = useState<ViewSummary[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [documentHeading, setDocumentHeading] = useState<string | undefined>();
    // What the open document offers ⌘K, set by its screen while it is open.
    const documentActions = useRef<(() => PaletteAction[]) | undefined>(undefined);
    const toasts = Toast.useToastManager();
    const offerUndo = useOfferUndo();

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

    // The route answers only the views the editor may open, and exists only when there are views.
    useEffect(() => {
        if (config.routes['editing_list_views'] === undefined) {
            setViews([]);
            return;
        }
        void connection
            .call<{ views: ViewSummary[] }>('editing_list_views')
            .then((answer) => setViews(answer.status === 200 ? answer.body.views : []));
    }, [connection, config.routes]);

    // A list or a count may have changed while the person was on another screen.
    useEffect(() => {
        if (screen.kind !== 'document') void loadLists();
    }, [screen, loadLists]);

    const sites = useMemo(() => config.sites ?? [], [config.sites]);
    const allSites = sites.length > 0 && config.allSites !== false;
    // The site the admin is shown in, or `undefined` for All sites, which keeps its place while an admin opens a site's document.
    const [chosen, setChosen] = useState<string | undefined>(() => (allSites ? screen.site : (screen.site ?? sites[0]?.key)));
    const view =
        screen.site !== undefined
            ? allSites && chosen === undefined
                ? undefined
                : screen.site
            : showsEverySite(screen) && allSites
              ? undefined
              : chosen;
    useEffect(() => {
        if (view !== chosen) setChosen(view);
    }, [view, chosen]);
    // An editor of some sites opens their first site where an admin opens All sites.
    useEffect(() => {
        if (!allSites && view !== undefined && showsEverySite(screen)) replaceAddress(hrefIn(view, screen));
    }, [allSites, view, screen]);
    showSite(view);
    const site = sites.find((candidate) => candidate.key === view);
    const siteOfScreen = sites.find((candidate) => candidate.key === screen.site);
    const titleSite = site ?? siteOfScreen;
    const [folded, setFolded] = useState<Set<string>>(() => readFolded(sites));
    const toggleFolded = (key: string): void =>
        setFolded((current) => {
            const next = new Set(current);
            if (!next.delete(key)) next.add(key);
            saveFolded(next);
            return next;
        });
    const sections = useMemo(
        () =>
            navigationOf({
                globals: globals ?? [],
                collections: collections ?? [],
                views: views ?? [],
                groups: config.groups,
                sites,
                ...(site === undefined
                    ? {}
                    : {
                          site: site.key,
                      }),
            }),
        [globals, collections, views, config.groups, sites, site]
    );

    // The tab is named after the screen: a document by its title, and anything else as the sidebar names it.
    const screenTitle =
        screen.kind === 'document'
            ? documentHeading
            : screen.kind === 'pages'
              ? 'Pages'
              : sections.flatMap((section) => section.entries).find((entry) => isCurrent(entry.screen, screen))?.label;
    const siteName = titleSite?.label ?? config.siteName;
    useEffect(() => {
        window.document.title = tabTitleOf(screen.kind === 'dashboard' ? 'Dashboard' : screenTitle, siteName);
    }, [screen.kind, screenTitle, siteName]);
    useTabIcon(titleSite?.icon ?? undefined);

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
            offerUndo,
        }),
        [connection, config.siteUrl, offerUndo]
    );

    const me = people === undefined ? undefined : people.people.find((person) => person.id === people.me);

    /**
     * What ⌘K offers under Actions: the open document's buttons, or a new
     * item of each collection on any other screen.
     */
    const paletteActions = (): PaletteAction[] => {
        if (screen.kind === 'document') return documentActions.current?.() ?? [];
        if (config.routes['editing_collections_create_item'] === undefined) return [];
        return (collections ?? []).map((collection) => {
            const one = singularOf(collection.label);
            return {
                label: `Create new ${one === collection.label ? `${collection.label.toLowerCase()} item` : one.toLowerCase()}`,
                run: () =>
                    void createItem(connection, collection.name).then((created) => {
                        if ('problem' in created) {
                            toasts.add({
                                description: created.problem,
                            });
                            return;
                        }
                        openDocument(created.ref);
                    }),
            };
        });
    };

    // A list the address names that the editor has none of, or may not open, or an address that names no screen.
    const missing = (noun: string) => (
        <>
            <PageHeader
                crumbs={[]}
                title="Not found"
                meta={[
                    {
                        label: 'Address',
                        value: shownAddress(),
                    },
                ]}
            />
            <NotFound
                noun={noun}
                back={{
                    label: 'Go to the dashboard',
                    href: hrefOf({
                        kind: 'dashboard',
                    }),
                }}
                onSearch={openSearch}
            />
        </>
    );

    const shown = (() => {
        if (screen.kind === 'missing') return missing('screen');
        if (screen.kind === 'pages') {
            return (
                <PagesList
                    connection={connection}
                    routes={config.routes}
                    site={screen.site}
                    sites={screen.site === undefined ? sites : undefined}
                    siteFact={screen.site === undefined ? undefined : <SiteFact site={siteOfScreen} />}
                />
            );
        }
        if (screen.kind === 'media') {
            return (
                <MediaLibrary
                    connection={connection}
                    selectedId={screen.id}
                    people={people}
                    collectionLabel={collectionLabel}
                    site={screen.site}
                />
            );
        }
        if (screen.kind === 'collection') {
            const own = siteOfScreen?.collections.find((candidate) => candidate.name === screen.name);
            // TODO(sites): the collections route lists the shared collections alone, so a site's own lists from the config until it lists them too.
            const collection =
                collections?.find((candidate) => candidate.name === screen.name) ??
                (own === undefined || collections === undefined
                    ? undefined
                    : {
                          name: own.name,
                          label: own.label ?? humanize(own.name),
                          count: 0,
                      });
            if (collection === undefined) {
                if (collections !== undefined) return missing('list');
                return (
                    <div className="k-admin__body">
                        <Loading problem={problem} />
                    </div>
                );
            }
            return (
                <CollectionList
                    key={`${screen.site ?? ''}:${collection.name}`}
                    connection={own === undefined ? connection : withSiteCollections(connection, siteOfScreen!.key)}
                    collection={collection}
                    group={groupOf(collection.name)}
                    options={config.lists[collection.name]}
                    routes={config.routes}
                    onOpen={openDocument}
                    siteFact={sites.length === 0 ? undefined : <SiteFact site={own === undefined ? undefined : siteOfScreen} />}
                />
            );
        }
        if (screen.kind === 'document') {
            // A shared document that sites set values on has a tab for each, and a site's tab edits that site's values.
            const sharedName = sharedNameOf(screen.ref);
            const tabSites = sites.filter(
                (candidate) => sharedName !== undefined && config.siteValues?.[sharedName]?.includes(candidate.key)
            );
            const onSiteTab = screen.site !== undefined && tabSites.some((candidate) => candidate.key === screen.site);
            const documentRef = onSiteTab ? siteValuesRefOf(screen.ref, screen.site!) : screen.ref;
            return (
                <DocumentScreen
                    key={documentRef}
                    connection={connection}
                    documentRef={documentRef}
                    sharedRef={onSiteTab ? screen.ref : undefined}
                    siteTabs={
                        tabSites.length === 0 ? undefined : (
                            <SiteTabs documentRef={screen.ref} sites={tabSites} current={onSiteTab ? screen.site : undefined} />
                        )
                    }
                    siteUrl={config.siteUrl}
                    people={people}
                    waiting={waiting ?? []}
                    collectionLabel={collectionLabel}
                    onReviewsChanged={() => void loadWaiting()}
                    role={config.role}
                    onSearch={openSearch}
                    onTitle={setDocumentHeading}
                    paletteActions={documentActions}
                />
            );
        }
        if (screen.kind === 'view' || screen.kind === 'record') {
            const name = screen.kind === 'view' ? screen.name : screen.view;
            const view = views?.find((candidate) => candidate.name === name);
            if (view === undefined) {
                if (views !== undefined) return missing('list');
                return (
                    <div className="k-admin__body">
                        <Loading />
                    </div>
                );
            }
            if (screen.kind === 'record') {
                return (
                    <RecordScreen
                        key={`${view.name}:${screen.id}`}
                        connection={connection}
                        viewName={view.name}
                        viewLabel={view.label}
                        id={screen.id}
                        role={config.role}
                        onSearch={openSearch}
                    />
                );
            }
            return <ViewList key={view.name} connection={connection} view={view} />;
        }
        return <Dashboard connection={connection} collections={collections} onOpen={openDocument} />;
    })();

    const dashboardHref = hrefOf({
        kind: 'dashboard',
    });
    const brand = (
        <a className="k-sidebar__brand" href={dashboardHref} aria-label="Dashboard">
            <Logo />
        </a>
    );
    const groups = (
        <div className="k-sidebar__groups">
            <div className="k-sidebar__group">
                <a className="k-sidebar__item" href={dashboardHref} aria-current={screen.kind === 'dashboard' ? 'page' : undefined}>
                    {sites.length === 0 ? null : <LayoutGrid {...ICON} className="k-sidebar__icon" />}
                    <span className="k-sidebar__label k-ellipsis">Dashboard</span>
                    {waiting !== undefined && waiting.length > 0 ? (
                        <span className="k-sidebar__count" aria-label={`${waiting.length} waiting for your review`}>
                            {waiting.length}
                        </span>
                    ) : null}
                </a>
            </div>
            {sections.map((section) => {
                const foldable = view === undefined && section.site !== undefined;
                const isFolded = foldable && folded.has(section.site!);
                return (
                    <div
                        key={section.label}
                        className="k-sidebar__group"
                        data-shared={sites.length > 0 && section.site === undefined ? '' : undefined}>
                        {foldable ? (
                            <h2 className="k-heading k-sidebar__heading">
                                <button
                                    type="button"
                                    className="k-sidebar__fold"
                                    aria-expanded={!isFolded}
                                    onClick={() => toggleFolded(section.site!)}>
                                    <span className="k-ellipsis">{section.label}</span>
                                    {isFolded ? <ChevronRight {...ICON} /> : <ChevronDown {...ICON} />}
                                </button>
                            </h2>
                        ) : (
                            <h2 className="k-heading k-sidebar__heading">{section.label}</h2>
                        )}
                        {(isFolded ? [] : section.entries).map((entry) => {
                            const Icon = sites.length === 0 ? undefined : entryIconOf(entry.screen);
                            return (
                                <a
                                    key={hrefOf(entry.screen)}
                                    className="k-sidebar__item"
                                    href={hrefOf(entry.screen)}
                                    aria-current={isCurrent(entry.screen, screen) ? 'page' : undefined}>
                                    {Icon === undefined ? null : <Icon {...ICON} className="k-sidebar__icon" />}
                                    <span className="k-sidebar__label k-ellipsis">{entry.label}</span>
                                </a>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
    const switcher =
        sites.length === 0 ? null : <SiteSwitcher sites={sites} shown={view} allSites={allSites} screen={screen} onChoose={setChosen} />;
    const signedIn = (
        <SignedIn
            person={me}
            role={config.role}
            signOutPath={config.signOutPath}
            signOutMethod={config.signOutMethod ?? 'GET'}
            theme={theme}
            onThemeChange={chooseTheme}
            onEditInChat={
                config.chat === undefined || config.chat === null
                    ? undefined
                    : () => {
                          setMenuOpen(false);
                          setChatOpen(true);
                      }
            }
        />
    );

    return (
        <EditorContext.Provider value={editorContext}>
            <div className="k-admin">
                {phone ? (
                    <header className="k-phone-bar">
                        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
                            <Dialog.Trigger className="k-icon-button k-phone-bar__button" aria-label="Open menu">
                                <MenuIcon {...ICON} />
                            </Dialog.Trigger>
                            <Dialog.Portal>
                                <Dialog.Backdrop className="k-backdrop" />
                                <Dialog.Popup className="k-nav-sheet">
                                    <Dialog.Title className="k-visually-hidden">Menu</Dialog.Title>
                                    <nav className="k-nav-sheet__nav" aria-label="Admin">
                                        <div className="k-nav-sheet__head">
                                            {brand}
                                            <Dialog.Close className="k-icon-button k-phone-bar__button" aria-label="Close menu">
                                                <X {...ICON} />
                                            </Dialog.Close>
                                        </div>
                                        {switcher}
                                        <SearchButton onOpen={openSearch} />
                                        {groups}
                                        {signedIn}
                                    </nav>
                                </Dialog.Popup>
                            </Dialog.Portal>
                        </Dialog.Root>
                        {brand}
                        <SearchButton onOpen={openSearch} compact />
                    </header>
                ) : (
                    <nav className="k-sidebar" aria-label="Admin">
                        {brand}
                        {switcher}
                        <SearchButton onOpen={openSearch} />
                        {groups}
                        {signedIn}
                    </nav>
                )}
                <main className="k-admin__main">{shown}</main>
            </div>
            {config.chat === undefined || config.chat === null ? null : (
                <EditInChat open={chatOpen} onOpenChange={setChatOpen} chat={config.chat} editorName={me?.name} />
            )}
            <CommandPalette
                open={searching}
                onOpenChange={setSearching}
                connection={connection}
                sections={sections}
                collections={collections}
                actions={paletteActions}
            />
        </EditorContext.Provider>
    );
}
