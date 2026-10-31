import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Checkbox } from '@base-ui/react/checkbox';
import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { Toast } from '@base-ui/react/toast';
import {
    Check,
    ChevronDown,
    ChevronRight,
    Download,
    Folder,
    FolderPlus,
    LayoutGrid,
    Library,
    List,
    LoaderCircle,
    Search,
    Upload,
    X,
} from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON, useEditorContext } from '../view/context.js';
import { Hint } from '../view/hint.js';
import { uploadMedia } from '../view/media.js';
import type { People } from '../view/people.js';
import { humanize, languageNameOf } from '../view/schema.js';
import { parseRef } from '../refs.js';
import type { AdminSite } from './config.js';
import { ConfirmDialog } from './confirm.js';
import { countOf, pageOf } from './list-columns.js';
import { PAGE_SIZE, Pager } from './list.js';
import {
    MEDIA_SORTS,
    bytesOf,
    deleteQuestionOf,
    destinationsIn,
    fieldLabelOf,
    folderDetailOf,
    folderTrail,
    foldersAt,
    focalPointAt,
    focalTextOf,
    formatOf,
    formatsIn,
    heldTitleOf,
    imagesAt,
    shownMedia,
    usageOf,
    usesBySite,
    type MediaFolderItem,
    type MediaItem,
    type MediaScope,
    type MediaUse,
    type MoveDestination,
} from './media-library.js';
import { withMediaSite } from './connection.js';
import { hasSites, hrefIn, hrefOf, navigate, useAddress } from './navigation.js';
import { PageHeader } from './page-header.js';
import { Loading, problemOf } from './parts.js';
import { SiteIcon } from './site-switcher.js';
import { dayOf } from './time.js';

type Layout = 'grid' | 'list';

/**
 * The tallest the open image shows, in pixels. Its width follows from its
 * shape, up to the panel's.
 */
const PREVIEW_HEIGHT = 360;

const LAYOUT_KEY = 'kizuna-cms:media-layout';

const readLayout = (): Layout => {
    try {
        return window.localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid';
    } catch {
        return 'grid';
    }
};

const saveLayout = (layout: Layout): void => {
    try {
        window.localStorage.setItem(LAYOUT_KEY, layout);
    } catch {
        // A private window keeps no storage, and the grid is the default anyway.
    }
};

/**
 * The address of the library, in a folder or at its top level, with an image
 * open or none.
 */
const libraryHref = (folder: string | undefined, id?: string): string => {
    const path = hrefOf(
        id === undefined
            ? {
                  kind: 'media',
              }
            : {
                  kind: 'media',
                  id,
              }
    );
    return folder === undefined ? path : `${path}?folder=${encodeURIComponent(folder)}`;
};

/**
 * What a held image's dialog lists: the documents holding it, and the title
 * that says why nothing changed.
 */
interface Held {
    title: string;
    uses: MediaUse[];
}

/**
 * The media library: a library's folders above its images, in a grid or a
 * list, found by name or alt text, with uploads dropped anywhere on it. In a
 * site's library, Shared comes first and opens the shared library. Ticked
 * images move into another folder or library. The image the address names
 * opens beside the grid, where its own alt text and focal point are set, its
 * uses listed, and it is deleted.
 */
export function MediaLibrary({
    connection: anyConnection,
    selectedId,
    people,
    collectionLabel,
    site,
    sites,
}: {
    connection: Connection;
    selectedId: string | undefined;
    people: People | undefined;
    collectionLabel: (name: string) => string | undefined;
    /**
     * The site the library is shown in, which lists its own images beside the
     * shared ones and keeps what is uploaded.
     */
    site?: string | undefined;
    /**
     * The sites the editor opens, for the uses grouped under each and the
     * libraries Move offers.
     */
    sites: readonly AdminSite[];
}) {
    const connection = useMemo(() => withMediaSite(anyConnection, site), [anyConnection, site]);
    const toasts = Toast.useToastManager();
    const folderParam = useAddress().searchParams.get('folder') ?? undefined;
    const [items, setItems] = useState<MediaItem[] | undefined>();
    const [folders, setFolders] = useState<MediaFolderItem[]>([]);
    const [maxBytes, setMaxBytes] = useState<number | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [query, setQuery] = useState('');
    const [scope, setScope] = useState<MediaScope>('all');
    const [format, setFormat] = useState<string | undefined>();
    const [sort, setSort] = useState('newest');
    const [layout, setLayout] = useState<Layout>(readLayout);
    const [page, setPage] = useState(0);
    const [perPage, setPerPage] = useState(PAGE_SIZE);
    const [uploading, setUploading] = useState<{ done: number; total: number } | undefined>();
    const [uploadProblems, setUploadProblems] = useState<string[]>([]);
    const [over, setOver] = useState(false);
    const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
    const [naming, setNaming] = useState<{ folder: MediaFolderItem | undefined } | undefined>();
    const [moving, setMoving] = useState(false);
    const [held, setHeld] = useState<Held | undefined>();
    const [confirmingDelete, setConfirmingDelete] = useState<'images' | 'folder' | undefined>();
    const chooser = useRef<HTMLInputElement>(null);

    const load = useCallback(async (): Promise<void> => {
        const answer = await connection.call<{ media: MediaItem[]; folders: MediaFolderItem[]; maxBytes: number }>('editing_media_list');
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'The images could not be listed'));
            return;
        }
        setItems(answer.body.media);
        setFolders(answer.body.folders ?? []);
        setMaxBytes(answer.body.maxBytes);
        setProblem(undefined);
    }, [connection]);

    useEffect(() => {
        void load();
    }, [load]);

    const folder = folders.find((candidate) => candidate.id === folderParam && candidate.site === site);
    const folderId = folder?.id;
    const everywhere = query.trim() !== '' || scope === 'unused';

    // A search, a filter or another folder starts again from the first page, with nothing ticked.
    useEffect(() => {
        setPage(0);
        setTicked(new Set());
    }, [query, scope, format, sort, folderId, site]);

    const shown = useMemo(
        () =>
            shownMedia(
                imagesAt(items ?? [], {
                    site,
                    folder: folderId,
                    everywhere,
                }),
                {
                    query,
                    scope,
                    format,
                    sort,
                }
            ),
        [items, site, folderId, everywhere, query, scope, format, sort]
    );
    const shownPage = pageOf(shown, page, perPage);
    const unused = (items ?? []).filter((item) => item.uses === 0).length;
    const selected = items?.find((item) => item.id === selectedId);
    const formats = formatsIn(items ?? []);
    const innerFolders = everywhere ? [] : foldersAt(folders, folderId, site);
    const trail = folderTrail(folders, folderId);
    const tickedItems = (items ?? []).filter((item) => ticked.has(item.id));

    const tick = (id: string, on: boolean): void =>
        setTicked((current) => {
            const next = new Set(current);
            if (on) next.add(id);
            else next.delete(id);
            return next;
        });

    const upload = async (files: readonly File[]): Promise<void> => {
        if (files.length === 0) return;
        setUploadProblems([]);
        const problems: string[] = [];
        let last: string | undefined;
        for (const [index, file] of files.entries()) {
            setUploading({
                done: index,
                total: files.length,
            });
            const uploaded = await uploadMedia(connection, file, folderId);
            if ('problem' in uploaded) problems.push(`${file.name}: ${uploaded.problem}`);
            else last = uploaded.id;
        }
        setUploading(undefined);
        setUploadProblems(problems);
        await load();
        const added = files.length - problems.length;
        if (added > 0) {
            toasts.add({
                description: added === 1 ? 'Uploaded 1 image.' : `Uploaded ${added} images.`,
            });
        }
        if (added === 1 && last !== undefined) navigate(libraryHref(folderId, last));
    };

    const drop = (event: DragEvent<HTMLElement>): void => {
        event.preventDefault();
        setOver(false);
        void upload([...event.dataTransfer.files]);
    };

    const saveFolder = async (name: string): Promise<string | undefined> => {
        const renaming = naming?.folder;
        const answer =
            renaming === undefined
                ? await connection.call<MediaFolderItem>('editing_media_create_folder', {
                      body: {
                          name,
                          ...(folderId === undefined
                              ? {}
                              : {
                                    parent: folderId,
                                }),
                      },
                  })
                : await connection.call<MediaFolderItem>('editing_media_update_folder', {
                      params: {
                          id: renaming.id,
                      },
                      body: {
                          name,
                      },
                  });
        if (answer.status !== 200 && answer.status !== 201) return problemOf(answer, 'The folder was not saved');
        setNaming(undefined);
        await load();
        return undefined;
    };

    const deleteFolder = async (): Promise<void> => {
        setConfirmingDelete(undefined);
        if (folder === undefined) return;
        const answer = await connection.call('editing_media_delete_folder', {
            params: {
                id: folder.id,
            },
        });
        if (answer.status >= 300) {
            toasts.add({
                description: problemOf(answer, 'The folder was not deleted'),
            });
            return;
        }
        toasts.add({
            description: `Deleted ${folder.name}.`,
        });
        navigate(libraryHref(folder.parent));
        await load();
    };

    const move = async (to: MoveDestination): Promise<void> => {
        setMoving(false);
        const answer = await connection.call<{ media: MediaItem[] }>('editing_media_move', {
            body: {
                ids: [...ticked],
                ...(to.site === undefined
                    ? {}
                    : {
                          site: to.site,
                      }),
                ...(to.folder === undefined
                    ? {}
                    : {
                          folder: to.folder,
                      }),
            },
        });
        if (answer.status === 409) {
            const body = answer.body as unknown as { uses?: MediaUse[] };
            const label = sites.find((candidate) => candidate.key === to.site)?.label ?? to.site ?? 'Shared';
            setHeld({
                title: tickedItems.length === 1 ? heldTitleOf(tickedItems[0]!.filename, 0, label) : `Images are used outside ${label}`,
                uses: body.uses ?? [],
            });
            return;
        }
        if (answer.status !== 200) {
            toasts.add({
                description: problemOf(answer, 'The images did not move'),
            });
            return;
        }
        toasts.add({
            description:
                ticked.size === 1
                    ? `Moved 1 image to ${to.name === 'Top level' ? 'the top level' : to.name}.`
                    : `Moved ${ticked.size} images.`,
        });
        setTicked(new Set());
        await load();
    };

    const deleteTicked = async (): Promise<void> => {
        setConfirmingDelete(undefined);
        let deleted = 0;
        for (const item of tickedItems) {
            const answer = await connection.call('editing_media_delete', {
                params: {
                    id: item.id,
                },
                ...(item.site === undefined
                    ? {}
                    : {
                          query: {
                              site: item.site,
                          },
                      }),
            });
            if (answer.status < 300) deleted += 1;
        }
        toasts.add({
            description: deleted === 1 ? 'Deleted 1 image.' : `Deleted ${deleted} images.`,
        });
        setTicked(new Set());
        await load();
    };

    // Deleting ticked images deletes none of them while any one is held, and lists what holds them.
    const askDeleteTicked = async (): Promise<void> => {
        const heldItems = tickedItems.filter((item) => item.uses > 0);
        if (heldItems.length === 0) {
            setConfirmingDelete('images');
            return;
        }
        const uses: MediaUse[] = [];
        for (const item of heldItems) {
            const answer = await connection.call<{ uses: MediaUse[] }>('editing_media_uses', {
                params: {
                    id: item.id,
                },
            });
            if (answer.status === 200) uses.push(...answer.body.uses);
        }
        setHeld({
            title:
                heldItems.length === 1
                    ? heldTitleOf(heldItems[0]!.filename, heldItems[0]!.uses)
                    : `${heldItems.length} of the images are in use`,
            uses,
        });
    };

    const limit = maxBytes === undefined ? '' : `, up to ${bytesOf(maxBytes)} each`;
    const formatLabel = format === undefined ? 'All types' : formatOf(format);
    const sortLabel = MEDIA_SORTS.find((candidate) => candidate.key === sort)?.label ?? 'Newest';
    const pickLayout = (next: Layout): void => {
        setLayout(next);
        saveLayout(next);
    };
    const siteOrder = sites.map((candidate) => candidate.key);
    const destinations = [
        ...destinationsIn(folders, site),
        ...(site === undefined
            ? sites.map((candidate) => ({
                  site: candidate.key,
                  folder: undefined,
                  name: 'Top level',
                  depth: 0,
              }))
            : destinationsIn(folders, undefined)),
    ];
    const crumbs = [
        ...(folder === undefined
            ? []
            : [
                  {
                      label: 'Media',
                      href: libraryHref(undefined),
                  },
              ]),
        ...trail.slice(0, -1).map((step) => ({
            label: step.name,
            href: libraryHref(step.id),
        })),
    ];

    return (
        <>
            <PageHeader
                crumbs={crumbs}
                title={folder?.name ?? 'Media'}
                meta={
                    items === undefined
                        ? undefined
                        : [
                              {
                                  label: 'Total',
                                  value: items.length === 1 ? '1 image' : `${countOf(items.length)} images`,
                              },
                              {
                                  label: 'Unused',
                                  value: countOf(unused),
                              },
                              {
                                  label: 'Storage',
                                  value: bytesOf(items.reduce((total, item) => total + item.size, 0)),
                              },
                          ]
                }
                actions={
                    ticked.size > 0 ? (
                        <div className="k-selection" role="group" aria-label="Selection">
                            <span className="k-selection__count" aria-live="polite">
                                {ticked.size} selected
                            </span>
                            <button
                                type="button"
                                className="k-button k-button--small k-selection__button"
                                onClick={() => setTicked(new Set(shown.map((item) => item.id)))}>
                                Select all {shown.length}
                            </button>
                            <button
                                type="button"
                                className="k-button k-button--small k-selection__button"
                                onClick={() => setTicked(new Set())}>
                                Clear
                            </button>
                            <span className="k-selection__divider" aria-hidden="true" />
                            <button
                                type="button"
                                className="k-button k-button--small k-button--secondary"
                                aria-haspopup="dialog"
                                onClick={() => setMoving(true)}>
                                Move
                            </button>
                            <button
                                type="button"
                                className="k-button k-button--small k-button--secondary"
                                aria-haspopup="dialog"
                                onClick={() => void askDeleteTicked()}>
                                Delete
                            </button>
                        </div>
                    ) : (
                        <>
                            <input
                                ref={chooser}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                                multiple
                                hidden
                                onChange={(event) => {
                                    void upload([...(event.target.files ?? [])]);
                                    event.target.value = '';
                                }}
                            />
                            {folder === undefined ? null : (
                                <Menu.Root>
                                    <Menu.Trigger
                                        className="k-button k-button--secondary k-button--small k-button--icon"
                                        aria-label={`More actions for ${folder.name}`}>
                                        <MoreIcon />
                                    </Menu.Trigger>
                                    <Menu.Portal>
                                        <Menu.Positioner sideOffset={6} align="end" className="k-positioner">
                                            <Menu.Popup className="k-popup k-menu k-document-menu">
                                                <Menu.Item
                                                    className="k-menu__item"
                                                    onClick={() =>
                                                        setNaming({
                                                            folder,
                                                        })
                                                    }>
                                                    Rename folder
                                                </Menu.Item>
                                                <Menu.Separator className="k-menu__separator" />
                                                <Menu.Item className="k-menu__item" onClick={() => setConfirmingDelete('folder')}>
                                                    Delete folder
                                                </Menu.Item>
                                            </Menu.Popup>
                                        </Menu.Positioner>
                                    </Menu.Portal>
                                </Menu.Root>
                            )}
                            <button
                                type="button"
                                className="k-button k-button--secondary k-button--small"
                                aria-haspopup="dialog"
                                onClick={() =>
                                    setNaming({
                                        folder: undefined,
                                    })
                                }>
                                <FolderPlus {...ICON} />
                                New folder
                            </button>
                            <button
                                type="button"
                                className="k-button k-button--primary k-button--small"
                                disabled={uploading !== undefined}
                                onClick={() => chooser.current?.click()}>
                                {uploading === undefined ? <Upload {...ICON} /> : <LoaderCircle {...ICON} className="k-spin" />}
                                Upload
                            </button>
                        </>
                    )
                }
                tabs={
                    <>
                        <div className="k-media-library__scopes" role="radiogroup" aria-label="Show">
                            {(
                                [
                                    ['all', 'All images', items?.length],
                                    ['unused', 'Unused', unused],
                                ] satisfies Array<[MediaScope, string, number | undefined]>
                            ).map(([key, label, count]) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="radio"
                                    className="k-tab"
                                    aria-checked={scope === key}
                                    onClick={() => setScope(key)}>
                                    {label}
                                    {count === undefined ? null : <span className="k-tab__count">{countOf(count)}</span>}
                                </button>
                            ))}
                        </div>
                        <span className="k-spacer" />
                        <div className="k-media-library__scopes" role="radiogroup" aria-label="Layout">
                            <button
                                type="button"
                                role="radio"
                                className="k-tab"
                                aria-checked={layout === 'grid'}
                                onClick={() => pickLayout('grid')}>
                                <LayoutGrid {...ICON} />
                                Grid
                            </button>
                            <button
                                type="button"
                                role="radio"
                                className="k-tab"
                                aria-checked={layout === 'list'}
                                onClick={() => pickLayout('list')}>
                                <List {...ICON} />
                                List
                            </button>
                        </div>
                    </>
                }
            />
            <div className="k-media-library" data-details={selected === undefined ? undefined : ''}>
                <section
                    className="k-media-library__files"
                    aria-label="Images"
                    data-over={over ? '' : undefined}
                    onDragOver={(event) => {
                        if (![...event.dataTransfer.types].includes('Files')) return;
                        event.preventDefault();
                        setOver(true);
                    }}
                    onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
                    }}
                    onDrop={drop}>
                    <div className="k-list-toolbar">
                        <label className="k-list-toolbar__search">
                            <Search {...ICON} />
                            <span className="k-visually-hidden">Search media</span>
                            <input
                                type="search"
                                placeholder="Search by name or alt text"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </label>
                        <div className="k-list-toolbar__buttons">
                            <Menu.Root>
                                <Menu.Trigger className="k-button k-button--small k-button--secondary k-list-toolbar__button">
                                    <span className="k-media-library__menu-label">Type</span>
                                    {formatLabel}
                                    <ChevronDown {...ICON} />
                                </Menu.Trigger>
                                <Menu.Portal>
                                    <Menu.Positioner sideOffset={6} align="end" className="k-positioner">
                                        <Menu.Popup className="k-popup k-menu k-sort-menu">
                                            <Menu.RadioGroup
                                                value={format ?? ''}
                                                onValueChange={(next: string) => setFormat(next === '' ? undefined : next)}>
                                                {[
                                                    {
                                                        contentType: '',
                                                        label: 'All types',
                                                    },
                                                    ...formats,
                                                ].map((choice) => (
                                                    <Menu.RadioItem
                                                        key={choice.contentType}
                                                        value={choice.contentType}
                                                        className="k-menu__item"
                                                        closeOnClick>
                                                        {choice.label}
                                                        <Menu.RadioItemIndicator className="k-menu__check">
                                                            <Check {...ICON} />
                                                        </Menu.RadioItemIndicator>
                                                    </Menu.RadioItem>
                                                ))}
                                            </Menu.RadioGroup>
                                        </Menu.Popup>
                                    </Menu.Positioner>
                                </Menu.Portal>
                            </Menu.Root>
                            <Menu.Root>
                                <Menu.Trigger className="k-button k-button--small k-button--secondary k-list-toolbar__button">
                                    <span className="k-media-library__menu-label">Sort</span>
                                    {sortLabel}
                                    <ChevronDown {...ICON} />
                                </Menu.Trigger>
                                <Menu.Portal>
                                    <Menu.Positioner sideOffset={6} align="end" className="k-positioner">
                                        <Menu.Popup className="k-popup k-menu k-sort-menu">
                                            <Menu.RadioGroup value={sort} onValueChange={(next: string) => setSort(next)}>
                                                {MEDIA_SORTS.map((choice) => (
                                                    <Menu.RadioItem
                                                        key={choice.key}
                                                        value={choice.key}
                                                        className="k-menu__item"
                                                        closeOnClick>
                                                        {choice.label}
                                                        <Menu.RadioItemIndicator className="k-menu__check">
                                                            <Check {...ICON} />
                                                        </Menu.RadioItemIndicator>
                                                    </Menu.RadioItem>
                                                ))}
                                            </Menu.RadioGroup>
                                        </Menu.Popup>
                                    </Menu.Positioner>
                                </Menu.Portal>
                            </Menu.Root>
                        </div>
                    </div>
                    <div className="k-media-drop" role="status">
                        <span className="k-media-drop__icon" aria-hidden="true">
                            {uploading === undefined ? <Upload {...ICON} /> : <LoaderCircle {...ICON} className="k-spin" />}
                        </span>
                        <div className="k-media-drop__text">
                            {uploading !== undefined ? (
                                <p className="k-media-drop__title">
                                    Uploading {uploading.done + 1} of {uploading.total}
                                </p>
                            ) : over ? (
                                <p className="k-media-drop__title">Drop to upload</p>
                            ) : (
                                <p className="k-media-drop__title">
                                    Drop images here to upload, or{' '}
                                    <button type="button" className="k-media-drop__choose" onClick={() => chooser.current?.click()}>
                                        choose files
                                    </button>
                                </p>
                            )}
                            <p className="k-media-drop__hint">JPEG, PNG, WebP, GIF or AVIF{limit}</p>
                        </div>
                    </div>
                    {uploadProblems.length === 0 ? null : (
                        <ul className="k-media-library__problems" role="alert">
                            {uploadProblems.map((line) => (
                                <li key={line} className="k-error">
                                    {line}
                                </li>
                            ))}
                        </ul>
                    )}
                    {items === undefined ? null : (
                        <FolderList
                            shared={
                                !everywhere && site !== undefined && folderId === undefined
                                    ? folders.filter((candidate) => candidate.site === undefined)
                                    : undefined
                            }
                            sharedImages={(items ?? []).filter((item) => item.site === undefined).length}
                            folders={innerFolders}
                            allFolders={folders}
                        />
                    )}
                    {items === undefined ? (
                        <Loading problem={problem} />
                    ) : shown.length === 0 ? (
                        innerFolders.length > 0 || (site !== undefined && folderId === undefined && !everywhere) ? null : (
                            <div className="k-list-results__empty">
                                <h2 className="k-list-results__empty-title">
                                    {items.length === 0 ? 'No images yet' : everywhere ? 'Nothing matches' : 'No images here'}
                                </h2>
                                {everywhere ? (
                                    <button
                                        type="button"
                                        className="k-button k-button--secondary k-button--small k-list-results__empty-action"
                                        onClick={() => {
                                            setQuery('');
                                            setScope('all');
                                            setFormat(undefined);
                                        }}>
                                        Show every image
                                    </button>
                                ) : null}
                            </div>
                        )
                    ) : (
                        <>
                            {layout === 'grid' ? (
                                <MediaGrid
                                    items={shownPage.rows}
                                    selectedId={selectedId}
                                    sharedShown={site !== undefined}
                                    folder={folderId}
                                    folders={everywhere ? folders : undefined}
                                    ticked={ticked}
                                    onTick={tick}
                                />
                            ) : (
                                <MediaTable
                                    items={shownPage.rows}
                                    selectedId={selectedId}
                                    sharedShown={site !== undefined}
                                    folder={folderId}
                                    ticked={ticked}
                                    onTick={tick}
                                />
                            )}
                            <Pager
                                page={shownPage.page}
                                pageCount={shownPage.pageCount}
                                first={shownPage.first}
                                last={shownPage.last}
                                total={shown.length}
                                perPage={perPage}
                                onPage={setPage}
                                onPerPage={(next) => {
                                    setPerPage(next);
                                    setPage(0);
                                }}
                            />
                        </>
                    )}
                </section>
                {selected === undefined ? null : (
                    <MediaDetails
                        key={selected.id}
                        connection={connection}
                        item={selected}
                        people={people}
                        collectionLabel={collectionLabel}
                        siteOrder={siteOrder}
                        sites={sites}
                        closeHref={libraryHref(folderId)}
                        onSaved={(saved) =>
                            setItems((current) => current?.map((candidate) => (candidate.id === saved.id ? saved : candidate)))
                        }
                        onDeleted={() => {
                            setItems((current) => current?.filter((candidate) => candidate.id !== selected.id));
                            navigate(libraryHref(folderId));
                        }}
                    />
                )}
                {selectedId !== undefined && items !== undefined && selected === undefined ? (
                    <aside className="k-media-details" aria-label="Image details">
                        <p className="k-help">There is no image {selectedId} in the library.</p>
                    </aside>
                ) : null}
            </div>
            <FolderNameDialog
                open={naming !== undefined}
                title={naming?.folder === undefined ? 'New folder' : 'Rename folder'}
                initial={naming?.folder?.name ?? ''}
                action={naming?.folder === undefined ? 'Create' : 'Rename'}
                onSave={saveFolder}
                onCancel={() => setNaming(undefined)}
            />
            <MoveDialog
                open={moving}
                count={ticked.size}
                destinations={destinations}
                here={{
                    site,
                    folder: folderId,
                }}
                sites={sites}
                onMove={(to) => void move(to)}
                onCancel={() => setMoving(false)}
            />
            <HeldDialog
                held={held}
                collectionLabel={collectionLabel}
                siteOrder={siteOrder}
                sites={sites}
                onClose={() => setHeld(undefined)}
            />
            <ConfirmDialog
                confirming={
                    confirmingDelete === 'images'
                        ? {
                              label: 'Delete',
                              question:
                                  tickedItems.length === 1
                                      ? deleteQuestionOf(tickedItems[0]!.filename)
                                      : `Delete ${tickedItems.length} images? Nothing uses them.`,
                          }
                        : confirmingDelete === 'folder' && folder !== undefined
                          ? {
                                label: 'Delete',
                                question: `Delete the folder ${folder.name}?`,
                            }
                          : undefined
                }
                onConfirm={() => void (confirmingDelete === 'folder' ? deleteFolder() : deleteTicked())}
                onCancel={() => setConfirmingDelete(undefined)}
            />
        </>
    );
}

function MoreIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="1.6" fill="currentColor" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <circle cx="19" cy="12" r="1.6" fill="currentColor" />
        </svg>
    );
}

/**
 * The folders above the images: Shared first in a site's library, then the
 * folders where the library is open.
 */
function FolderList({
    shared,
    sharedImages,
    folders,
    allFolders,
}: {
    /**
     * The shared library's folders, when Shared shows as the first entry.
     */
    shared: readonly MediaFolderItem[] | undefined;
    sharedImages: number;
    folders: readonly MediaFolderItem[];
    allFolders: readonly MediaFolderItem[];
}) {
    if (shared === undefined && folders.length === 0) return null;
    const sharedTopLevel = shared?.filter((candidate) => candidate.parent === undefined).length ?? 0;
    return (
        <ul className="k-media-folders" aria-label="Folders">
            {shared === undefined ? null : (
                <li>
                    <a
                        className="k-media-folder"
                        href={hrefIn(undefined, {
                            kind: 'media',
                        })}>
                        <Library {...ICON} />
                        <span className="k-media-folder__text">
                            <span className="k-media-folder__name k-ellipsis">Shared</span>
                            <span className="k-media-folder__detail">
                                {[
                                    ...(sharedTopLevel === 0 ? [] : [`${sharedTopLevel} ${sharedTopLevel === 1 ? 'folder' : 'folders'}`]),
                                    `${sharedImages} ${sharedImages === 1 ? 'image' : 'images'}`,
                                ].join(', ')}
                            </span>
                        </span>
                    </a>
                </li>
            )}
            {folders.map((folder) => (
                <li key={folder.id}>
                    <a className="k-media-folder" href={libraryHref(folder.id)}>
                        <Folder {...ICON} />
                        <span className="k-media-folder__text">
                            <span className="k-media-folder__name k-ellipsis">{folder.name}</span>
                            <span className="k-media-folder__detail">{folderDetailOf(folder, allFolders)}</span>
                        </span>
                    </a>
                </li>
            ))}
        </ul>
    );
}

function TileCheck({ item, checked, onTick }: { item: MediaItem; checked: boolean; onTick: (id: string, on: boolean) => void }) {
    return (
        <Checkbox.Root
            className="k-check k-media-tile__check"
            aria-label={`Select ${item.filename}`}
            checked={checked}
            onCheckedChange={(next) => onTick(item.id, next)}>
            <Checkbox.Indicator className="k-check__indicator">
                <Check {...ICON} />
            </Checkbox.Indicator>
        </Checkbox.Root>
    );
}

function MediaGrid({
    items,
    selectedId,
    sharedShown,
    folder,
    folders,
    ticked,
    onTick,
}: {
    items: readonly MediaItem[];
    selectedId: string | undefined;
    /**
     * Marks each shared image, in a site's library.
     */
    sharedShown: boolean;
    folder: string | undefined;
    /**
     * Every folder, when a search shows images from all of them, so each
     * names its own.
     */
    folders: readonly MediaFolderItem[] | undefined;
    ticked: ReadonlySet<string>;
    onTick: (id: string, on: boolean) => void;
}) {
    const { resolveUrl } = useEditorContext();
    return (
        <ul className="k-media-library__grid" aria-label="Images" data-ticking={ticked.size > 0 ? '' : undefined}>
            {items.map((item) => {
                const place = [
                    ...(folders === undefined
                        ? []
                        : [folders.find((candidate) => candidate.id === item.folder)?.name].filter((name) => name !== undefined)),
                    ...(sharedShown && item.site === undefined ? ['Shared'] : []),
                ];
                return (
                    <li key={item.id} className="k-media-library__cell">
                        <a
                            className="k-media-tile"
                            href={libraryHref(folder, item.id)}
                            aria-current={item.id === selectedId || ticked.has(item.id) ? 'true' : undefined}>
                            <img className="k-media-tile__thumb" src={resolveUrl(`${item.url}?w=480`)} alt="" loading="lazy" />
                            <span className="k-media-tile__text">
                                <span className="k-media-tile__name k-ellipsis">{item.filename}</span>
                                <span className="k-media-tile__detail">
                                    {bytesOf(item.size)} · {item.width} × {item.height}
                                </span>
                                <span className="k-media-tile__detail k-ellipsis">{[usageOf(item.uses), ...place].join(' · ')}</span>
                            </span>
                        </a>
                        <TileCheck item={item} checked={ticked.has(item.id)} onTick={onTick} />
                    </li>
                );
            })}
        </ul>
    );
}

function MediaTable({
    items,
    selectedId,
    sharedShown,
    folder,
    ticked,
    onTick,
}: {
    items: readonly MediaItem[];
    selectedId: string | undefined;
    sharedShown: boolean;
    folder: string | undefined;
    ticked: ReadonlySet<string>;
    onTick: (id: string, on: boolean) => void;
}) {
    const { resolveUrl } = useEditorContext();
    return (
        <div className="k-table__scroll">
            <table className="k-table k-media-table" aria-label="Images" data-selectable="">
                <thead>
                    <tr>
                        <th scope="col" className="k-table__select">
                            <span className="k-visually-hidden">Select</span>
                        </th>
                        <th scope="col">Name</th>
                        <th scope="col">Size</th>
                        <th scope="col">Dimensions</th>
                        <th scope="col">Used in</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr
                            key={item.id}
                            className="k-table__row"
                            data-selected={item.id === selectedId || ticked.has(item.id) ? '' : undefined}>
                            <td className="k-table__select">
                                <Checkbox.Root
                                    className="k-check"
                                    aria-label={`Select ${item.filename}`}
                                    checked={ticked.has(item.id)}
                                    onCheckedChange={(next) => onTick(item.id, next)}>
                                    <Checkbox.Indicator className="k-check__indicator">
                                        <Check {...ICON} />
                                    </Checkbox.Indicator>
                                </Checkbox.Root>
                            </td>
                            <td className="k-table__title">
                                <a
                                    className="k-media-table__name"
                                    href={libraryHref(folder, item.id)}
                                    aria-current={item.id === selectedId ? 'true' : undefined}>
                                    <img className="k-media-table__thumb" src={resolveUrl(`${item.url}?w=120`)} alt="" loading="lazy" />
                                    <span className="k-ellipsis">{item.filename}</span>
                                    {sharedShown && item.site === undefined ? <span className="k-help">Shared</span> : null}
                                </a>
                            </td>
                            <td>{bytesOf(item.size)}</td>
                            <td>
                                {item.width} × {item.height}
                            </td>
                            <td>{item.uses === 0 ? 'Unused' : item.uses === 1 ? '1 place' : `${item.uses} places`}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * Where a use leads, what it is called, and the line under it: the field
 * holding the image, after the collection for an item, then its languages,
 * and Draft when only a draft holds it.
 */
const useRowOf = (
    use: MediaUse,
    collectionLabel: (name: string) => string | undefined
): { href: string; title: string; detail: string } => {
    const ref = parseRef(use.ref);
    const fields = use.fieldPaths.map(fieldLabelOf).join('; ');
    const where = ref?.type === 'item' ? `${collectionLabel(ref.collection) ?? humanize(ref.collection)}, ${fields}` : fields;
    const detail = [
        where,
        ...(use.locales.length === 0 ? [] : [use.locales.map(languageNameOf).join(', ')]),
        ...(use.published ? [] : ['Draft']),
    ].join(' · ');
    const href = hrefOf({
        kind: 'document',
        ref: use.ref,
    });
    if (ref?.type === 'item') {
        return {
            href,
            title: use.label ?? 'Untitled',
            detail,
        };
    }
    return {
        href,
        title: use.label ?? (ref === undefined ? use.ref : humanize(ref.name)),
        detail,
    };
};

/**
 * Every document holding an image, under the site each belongs to, with
 * shared content last. One site's uses list without a heading.
 */
function UseList({
    uses,
    collectionLabel,
    siteOrder,
    sites,
}: {
    uses: readonly MediaUse[];
    collectionLabel: (name: string) => string | undefined;
    siteOrder: readonly string[];
    sites: readonly AdminSite[];
}) {
    const row = (use: MediaUse): ReactNode => {
        const shown = useRowOf(use, collectionLabel);
        return (
            <li key={`${use.ref} ${use.fieldPaths.join()}`}>
                <a className="k-media-use" href={shown.href}>
                    <span className="k-media-use__text">
                        <span className="k-media-use__title k-ellipsis">{shown.title}</span>
                        <span className="k-media-use__detail k-ellipsis">{shown.detail}</span>
                    </span>
                    <ChevronRight {...ICON} />
                </a>
            </li>
        );
    };
    if (!hasSites()) return <ul className="k-media-uses__list">{uses.map(row)}</ul>;
    return (
        <ul className="k-media-uses">
            {usesBySite(uses, siteOrder).map((group) => (
                <li key={group.site ?? ''} className="k-media-uses__group">
                    <span className="k-media-uses__site">
                        <SiteIcon site={sites.find((candidate) => candidate.key === group.site)} />
                        {group.site === undefined
                            ? 'Shared'
                            : (sites.find((candidate) => candidate.key === group.site)?.label ?? group.site)}
                    </span>
                    <ul className="k-media-uses__list" data-grouped="">
                        {group.uses.map(row)}
                    </ul>
                </li>
            ))}
        </ul>
    );
}

/**
 * Lists what holds an image when it cannot be deleted or moved, each a link
 * to that document, with nothing to confirm.
 */
function HeldDialog({
    held,
    collectionLabel,
    siteOrder,
    sites,
    onClose,
}: {
    held: Held | undefined;
    collectionLabel: (name: string) => string | undefined;
    siteOrder: readonly string[];
    sites: readonly AdminSite[];
    onClose: () => void;
}) {
    return (
        <Dialog.Root
            open={held !== undefined}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-media-dialog">
                    <div className="k-dialog__head">
                        <Dialog.Title className="k-dialog__title">{held?.title}</Dialog.Title>
                        <Dialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    {held === undefined ? null : (
                        <UseList uses={held.uses} collectionLabel={collectionLabel} siteOrder={siteOrder} sites={sites} />
                    )}
                    <div className="k-dialog__actions">
                        <Dialog.Close className="k-button k-button--secondary">Close</Dialog.Close>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/**
 * Names a new folder, or renames one.
 */
function FolderNameDialog({
    open,
    title,
    initial,
    action,
    onSave,
    onCancel,
}: {
    open: boolean;
    title: string;
    initial: string;
    action: string;
    onSave: (name: string) => Promise<string | undefined>;
    onCancel: () => void;
}) {
    const [name, setName] = useState(initial);
    const [problem, setProblem] = useState<string | undefined>();
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!open) return;
        setName(initial);
        setProblem(undefined);
    }, [open, initial]);
    const save = async (): Promise<void> => {
        if (name.trim() === '') return;
        setSaving(true);
        setProblem(await onSave(name.trim()));
        setSaving(false);
    };
    return (
        <Dialog.Root
            open={open}
            onOpenChange={(next) => {
                if (!next) onCancel();
            }}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog">
                    <form
                        className="k-media-dialog__form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void save();
                        }}>
                        <div className="k-dialog__head">
                            <Dialog.Title className="k-dialog__title">{title}</Dialog.Title>
                            <Dialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                                <X {...ICON} />
                            </Dialog.Close>
                        </div>
                        <label className="k-visually-hidden" htmlFor="k-media-folder-name">
                            Name
                        </label>
                        <input
                            id="k-media-folder-name"
                            className="k-input"
                            type="text"
                            maxLength={60}
                            value={name}
                            autoFocus
                            placeholder="Name"
                            onChange={(event) => setName(event.target.value)}
                        />
                        {problem === undefined ? null : (
                            <p className="k-error" role="alert">
                                {problem}
                            </p>
                        )}
                        <div className="k-dialog__actions">
                            <Dialog.Close type="button" className="k-button k-button--secondary">
                                Cancel
                            </Dialog.Close>
                            <button type="submit" className="k-button k-button--primary" disabled={saving || name.trim() === ''}>
                                {action}
                            </button>
                        </div>
                    </form>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/**
 * Picks where ticked images move: a folder of this library, or of the other
 * library, each library under its name.
 */
function MoveDialog({
    open,
    count,
    destinations,
    here,
    sites,
    onMove,
    onCancel,
}: {
    open: boolean;
    count: number;
    destinations: readonly MoveDestination[];
    here: { site: string | undefined; folder: string | undefined };
    sites: readonly AdminSite[];
    onMove: (to: MoveDestination) => void;
    onCancel: () => void;
}) {
    const [picked, setPicked] = useState<MoveDestination | undefined>();
    useEffect(() => {
        if (open) setPicked(undefined);
    }, [open]);
    const same = (
        left: { site: string | undefined; folder: string | undefined },
        right: { site: string | undefined; folder: string | undefined }
    ): boolean => left.site === right.site && left.folder === right.folder;
    const libraries = [...new Set(destinations.map((destination) => destination.site))];
    return (
        <Dialog.Root
            open={open}
            onOpenChange={(next) => {
                if (!next) onCancel();
            }}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-media-dialog">
                    <div className="k-dialog__head">
                        <Dialog.Title className="k-dialog__title">{count === 1 ? 'Move 1 image' : `Move ${count} images`}</Dialog.Title>
                        <Dialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    <div className="k-media-destinations" role="listbox" aria-label="Where to">
                        {libraries.map((library) => (
                            <div key={library ?? ''} role="group" aria-label={library === undefined ? 'Shared' : library}>
                                {hasSites() ? (
                                    <span className="k-media-destinations__library">
                                        <SiteIcon site={sites.find((candidate) => candidate.key === library)} />
                                        {library === undefined
                                            ? 'Shared'
                                            : (sites.find((candidate) => candidate.key === library)?.label ?? library)}
                                    </span>
                                ) : null}
                                {destinations
                                    .filter((destination) => destination.site === library)
                                    .map((destination) => {
                                        const isHere = same(destination, here);
                                        const chosen = picked !== undefined && same(destination, picked);
                                        return (
                                            <button
                                                key={`${destination.site ?? ''} ${destination.folder ?? ''}`}
                                                type="button"
                                                role="option"
                                                className="k-media-destination"
                                                aria-selected={chosen}
                                                disabled={isHere}
                                                style={{
                                                    paddingLeft: `${10 + destination.depth * 22}px`,
                                                }}
                                                onClick={() => setPicked(destination)}>
                                                <Folder {...ICON} />
                                                <span className="k-ellipsis">{destination.name}</span>
                                                {chosen ? <Check {...ICON} className="k-media-destination__check" /> : null}
                                            </button>
                                        );
                                    })}
                            </div>
                        ))}
                    </div>
                    <div className="k-dialog__actions">
                        <Dialog.Close className="k-button k-button--secondary">Cancel</Dialog.Close>
                        <button
                            type="button"
                            className="k-button k-button--primary"
                            disabled={picked === undefined}
                            onClick={() => {
                                if (picked !== undefined) onMove(picked);
                            }}>
                            Move
                        </button>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/**
 * One image beside the library: the image large, where a click sets its
 * focal point, its alt text, the documents that use it under their sites,
 * and its file's facts, with Save and a menu holding Copy link and Delete.
 */
function MediaDetails({
    connection,
    item,
    people,
    collectionLabel,
    siteOrder,
    sites,
    closeHref,
    onSaved,
    onDeleted,
}: {
    connection: Connection;
    item: MediaItem;
    people: People | undefined;
    collectionLabel: (name: string) => string | undefined;
    siteOrder: readonly string[];
    sites: readonly AdminSite[];
    closeHref: string;
    onSaved: (item: MediaItem) => void;
    onDeleted: () => void;
}) {
    const { resolveUrl } = useEditorContext();
    const toasts = Toast.useToastManager();
    const [alt, setAlt] = useState(item.alt);
    const [focal, setFocal] = useState(item.focalPoint);
    const [uses, setUses] = useState<{ uses: MediaUse[]; elsewhere: number } | undefined>();
    const [saving, setSaving] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
    const [confirming, setConfirming] = useState(false);
    const [held, setHeld] = useState<Held | undefined>();
    const panel = useRef<HTMLElement>(null);
    // A shared image is changed in the shared library, a site's in its own.
    const ownLibrary =
        item.site === undefined
            ? {}
            : {
                  query: {
                      site: item.site,
                  },
              };

    // Stacked above the images on a narrow screen, the details come into view when opened. Beside them they stay in view anyway.
    useEffect(() => {
        if (panel.current === null || window.getComputedStyle(panel.current).position === 'sticky') return;
        panel.current.scrollIntoView({
            block: 'nearest',
        });
    }, []);

    useEffect(() => {
        void connection
            .call<{ uses: MediaUse[]; elsewhere: number }>('editing_media_uses', {
                params: {
                    id: item.id,
                },
            })
            .then((answer) =>
                setUses(
                    answer.status === 200
                        ? {
                              uses: answer.body.uses,
                              elsewhere: answer.body.elsewhere ?? 0,
                          }
                        : {
                              uses: [],
                              elsewhere: 0,
                          }
                )
            );
    }, [connection, item.id]);

    const changed = alt !== item.alt || focal?.x !== item.focalPoint?.x || focal?.y !== item.focalPoint?.y;
    const useCount = uses === undefined ? item.uses : uses.uses.length + uses.elsewhere;
    const uploader = people?.people.find((person) => person.id === item.uploadedBy)?.name ?? item.uploadedBy;
    const url = resolveUrl(item.url);

    const save = async (): Promise<void> => {
        setSaving(true);
        setProblem(undefined);
        const answer = await connection.call<Omit<MediaItem, 'uses'>>('editing_media_update', {
            params: {
                id: item.id,
            },
            ...ownLibrary,
            body: {
                alt,
                focalPoint: focal ?? null,
            },
        });
        setSaving(false);
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'It was not saved'));
            return;
        }
        onSaved({
            ...answer.body,
            uses: item.uses,
        });
        toasts.add({
            description: `Saved ${item.filename}.`,
        });
    };

    const remove = async (): Promise<void> => {
        setConfirming(false);
        const answer = await connection.call('editing_media_delete', {
            params: {
                id: item.id,
            },
            ...ownLibrary,
        });
        if (answer.status === 409) {
            const body = answer.body as unknown as { uses?: MediaUse[] };
            setHeld({
                title: heldTitleOf(item.filename, body.uses?.length ?? useCount),
                uses: body.uses ?? [],
            });
            return;
        }
        if (answer.status >= 300) {
            setProblem(problemOf(answer, 'It was not deleted'));
            return;
        }
        toasts.add({
            description: `Deleted ${item.filename}.`,
        });
        onDeleted();
    };

    const askDelete = (): void => {
        if (uses !== undefined && useCount > 0) {
            setHeld({
                title: heldTitleOf(item.filename, useCount),
                uses: uses.uses,
            });
            return;
        }
        setConfirming(true);
    };

    return (
        <aside ref={panel} className="k-media-details" aria-label={`${item.filename} details`}>
            <div className="k-media-details__head">
                <h2 className="k-media-details__title">{item.filename}</h2>
                {url === undefined ? null : (
                    <Hint label="Download">
                        <a className="k-icon-button" href={url} download={item.filename} aria-label={`Download ${item.filename}`}>
                            <Download {...ICON} />
                        </a>
                    </Hint>
                )}
                <Hint label="Close">
                    <a className="k-icon-button" href={closeHref} aria-label="Close details">
                        <X {...ICON} />
                    </a>
                </Hint>
            </div>
            <div className="k-media-details__group">
                <div className="k-media-details__preview">
                    <button
                        type="button"
                        className="k-media-details__frame"
                        style={{
                            width: `min(100%, ${Math.round((PREVIEW_HEIGHT * item.width) / Math.max(1, item.height))}px)`,
                            aspectRatio: `${item.width} / ${item.height}`,
                        }}
                        aria-label={`Set the focal point of ${item.filename}`}
                        onClick={(event) =>
                            setFocal(
                                focalPointAt(
                                    {
                                        x: event.clientX,
                                        y: event.clientY,
                                    },
                                    event.currentTarget.getBoundingClientRect()
                                )
                            )
                        }>
                        <img src={resolveUrl(`${item.url}?w=800`)} alt={item.alt} />
                        {focal === undefined ? null : (
                            <span
                                className="k-image-frame__focal"
                                style={{
                                    left: `${focal.x * 100}%`,
                                    top: `${focal.y * 100}%`,
                                }}
                            />
                        )}
                    </button>
                </div>
                <div className="k-sheet__row">
                    <p className="k-help">
                        Click the image to set its focal point. Crops keep that spot in frame.{' '}
                        {focal === undefined ? 'None is set, so crops keep the centre.' : `Now at ${focalTextOf(focal)}.`}
                    </p>
                    {focal === undefined ? null : (
                        <button type="button" className="k-text-button" onClick={() => setFocal(undefined)}>
                            Reset
                        </button>
                    )}
                </div>
            </div>
            <div className="k-media-details__group" role="group" aria-labelledby="k-media-used">
                <span id="k-media-used" className="k-row__label">
                    {useCount === 0 ? 'Used in' : usageOf(useCount)}
                </span>
                {uses === undefined ? (
                    <LoaderCircle {...ICON} className="k-spin" />
                ) : useCount === 0 ? (
                    <p className="k-help">Nothing uses this image yet.</p>
                ) : (
                    <>
                        <UseList uses={uses.uses} collectionLabel={collectionLabel} siteOrder={siteOrder} sites={sites} />
                        {uses.elsewhere === 0 ? null : (
                            <p className="k-help">
                                {uses.elsewhere === 1
                                    ? '1 more in a site you do not edit'
                                    : `${uses.elsewhere} more in sites you do not edit`}
                            </p>
                        )}
                    </>
                )}
            </div>
            <div className="k-media-details__group">
                <label className="k-row__label" htmlFor="k-media-alt">
                    Alt text
                </label>
                <textarea
                    id="k-media-alt"
                    className="k-input k-textarea"
                    rows={3}
                    value={alt}
                    placeholder="What the image shows"
                    onChange={(event) => setAlt(event.target.value)}
                />
                <p className="k-help">
                    What the image shows, for someone who cannot see it. A field that picks the image starts with this text.
                </p>
            </div>
            <dl className="k-media-details__facts">
                <dt>Type</dt>
                <dd>{formatOf(item.contentType)} image</dd>
                <dt>Dimensions</dt>
                <dd>
                    {item.width} × {item.height}
                </dd>
                <dt>Size</dt>
                <dd>{bytesOf(item.size)}</dd>
                <dt>Uploaded</dt>
                <dd>
                    {dayOf(item.uploadedAt)} by {uploader}
                </dd>
            </dl>
            {problem === undefined ? null : (
                <p className="k-error" role="alert">
                    {problem}
                </p>
            )}
            <div className="k-media-details__actions">
                <button
                    type="button"
                    className="k-button k-button--primary k-button--small"
                    disabled={!changed || saving}
                    onClick={() => void save()}>
                    {saving ? <LoaderCircle {...ICON} className="k-spin" /> : null}
                    Save
                </button>
                <Menu.Root>
                    <Menu.Trigger
                        className="k-button k-button--secondary k-button--small k-button--icon"
                        aria-label={`More actions for ${item.filename}`}>
                        <MoreIcon />
                    </Menu.Trigger>
                    <Menu.Portal>
                        <Menu.Positioner sideOffset={6} align="start" className="k-positioner">
                            <Menu.Popup className="k-popup k-menu k-document-menu">
                                {url === undefined ? null : (
                                    <>
                                        <Menu.Item
                                            className="k-menu__item"
                                            onClick={() => {
                                                void navigator.clipboard?.writeText(url).then(() =>
                                                    toasts.add({
                                                        description: 'Copied the link.',
                                                    })
                                                );
                                            }}>
                                            Copy link
                                        </Menu.Item>
                                        <Menu.Separator className="k-menu__separator" />
                                    </>
                                )}
                                <Menu.Item className="k-menu__item" onClick={askDelete}>
                                    Delete image
                                    <span className="k-media-details__hint">{useCount === 0 ? 'Nothing uses it' : usageOf(useCount)}</span>
                                </Menu.Item>
                            </Menu.Popup>
                        </Menu.Positioner>
                    </Menu.Portal>
                </Menu.Root>
            </div>
            <ConfirmDialog
                confirming={
                    confirming
                        ? {
                              label: 'Delete',
                              question: deleteQuestionOf(item.filename),
                          }
                        : undefined
                }
                onConfirm={() => void remove()}
                onCancel={() => setConfirming(false)}
            />
            <HeldDialog
                held={held}
                collectionLabel={collectionLabel}
                siteOrder={siteOrder}
                sites={sites}
                onClose={() => setHeld(undefined)}
            />
        </aside>
    );
}
