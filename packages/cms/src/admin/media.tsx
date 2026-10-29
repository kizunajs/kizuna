import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Toast } from '@base-ui/react/toast';
import { Check, ChevronDown, ChevronRight, Download, LayoutGrid, List, LoaderCircle, Search, Upload, X } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON, useEditorContext } from '../view/context.js';
import { Hint } from '../view/hint.js';
import { uploadMedia } from '../view/media.js';
import type { People } from '../view/people.js';
import { humanize } from '../view/schema.js';
import { parseRef } from '../refs.js';
import { ConfirmDialog } from './confirm.js';
import { countOf, pageOf } from './list-columns.js';
import { PAGE_SIZE, Pager } from './list.js';
import {
    MEDIA_SORTS,
    bytesOf,
    deleteQuestionOf,
    fieldLabelOf,
    focalPointAt,
    focalTextOf,
    formatOf,
    formatsIn,
    shownMedia,
    usageOf,
    type MediaItem,
    type MediaScope,
    type MediaUse,
} from './media-library.js';
import { hrefOf } from './navigation.js';
import { PageHeader } from './page-header.js';
import { Loading, problemOf } from './parts.js';
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

const openImage = (id: string | undefined): void => {
    window.location.hash = hrefOf(
        id === undefined
            ? {
                  kind: 'media',
              }
            : {
                  kind: 'media',
                  id,
              }
    );
};

/**
 * The media library: every uploaded image in a grid or a list, found by name
 * or alt text, with uploads dropped anywhere on it. The image the address
 * names opens beside the grid, where its own alt text and focal point are
 * set, its uses listed, and it is deleted.
 */
export function MediaLibrary({
    connection,
    selectedId,
    people,
    collectionLabel,
}: {
    connection: Connection;
    selectedId: string | undefined;
    people: People | undefined;
    collectionLabel: (name: string) => string | undefined;
}) {
    const toasts = Toast.useToastManager();
    const [items, setItems] = useState<MediaItem[] | undefined>();
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
    const chooser = useRef<HTMLInputElement>(null);

    const load = useCallback(async (): Promise<void> => {
        const answer = await connection.call<{ media: MediaItem[]; maxBytes: number }>('editing_media_list');
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'The images could not be listed'));
            return;
        }
        setItems(answer.body.media);
        setMaxBytes(answer.body.maxBytes);
        setProblem(undefined);
    }, [connection]);

    useEffect(() => {
        void load();
    }, [load]);

    // A search or a filter starts again from the first page.
    useEffect(() => {
        setPage(0);
    }, [query, scope, format, sort]);

    const shown = useMemo(
        () =>
            shownMedia(items ?? [], {
                query,
                scope,
                format,
                sort,
            }),
        [items, query, scope, format, sort]
    );
    const shownPage = pageOf(shown, page, perPage);
    const unused = (items ?? []).filter((item) => item.uses === 0).length;
    const selected = items?.find((item) => item.id === selectedId);
    const formats = formatsIn(items ?? []);

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
            const uploaded = await uploadMedia(connection, file);
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
        if (added === 1 && last !== undefined) openImage(last);
    };

    const drop = (event: DragEvent<HTMLElement>): void => {
        event.preventDefault();
        setOver(false);
        void upload([...event.dataTransfer.files]);
    };

    const limit = maxBytes === undefined ? '' : `, up to ${bytesOf(maxBytes)} each`;
    const formatLabel = format === undefined ? 'All types' : formatOf(format);
    const sortLabel = MEDIA_SORTS.find((candidate) => candidate.key === sort)?.label ?? 'Newest';
    const pickLayout = (next: Layout): void => {
        setLayout(next);
        saveLayout(next);
    };

    return (
        <>
            <PageHeader
                crumbs={[]}
                title="Media"
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
                        <button
                            type="button"
                            className="k-button k-button--primary k-button--small"
                            disabled={uploading !== undefined}
                            onClick={() => chooser.current?.click()}>
                            {uploading === undefined ? <Upload {...ICON} /> : <LoaderCircle {...ICON} className="k-spin" />}
                            Upload
                        </button>
                    </>
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
                    {items === undefined ? (
                        <Loading problem={problem} />
                    ) : shown.length === 0 ? (
                        <div className="k-list-results__empty">
                            <h2 className="k-list-results__empty-title">{items.length === 0 ? 'No images yet' : 'Nothing matches'}</h2>
                            <p className="k-list-results__empty-text">
                                {items.length === 0
                                    ? 'Upload the first one, or drop it here.'
                                    : 'No images match the search, the type and what is shown.'}
                            </p>
                            {items.length === 0 ? null : (
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
                            )}
                        </div>
                    ) : (
                        <>
                            {layout === 'grid' ? (
                                <MediaGrid items={shownPage.rows} selectedId={selectedId} />
                            ) : (
                                <MediaTable items={shownPage.rows} selectedId={selectedId} />
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
                        onSaved={(saved) =>
                            setItems((current) => current?.map((candidate) => (candidate.id === saved.id ? saved : candidate)))
                        }
                        onDeleted={() => {
                            setItems((current) => current?.filter((candidate) => candidate.id !== selected.id));
                            openImage(undefined);
                        }}
                    />
                )}
                {selectedId !== undefined && items !== undefined && selected === undefined ? (
                    <aside className="k-media-details" aria-label="Image details">
                        <p className="k-help">There is no image {selectedId} in the library.</p>
                    </aside>
                ) : null}
            </div>
        </>
    );
}

function MediaGrid({ items, selectedId }: { items: readonly MediaItem[]; selectedId: string | undefined }) {
    const { resolveUrl } = useEditorContext();
    return (
        <ul className="k-media-library__grid" aria-label="Images">
            {items.map((item) => (
                <li key={item.id}>
                    <a
                        className="k-media-tile"
                        href={hrefOf({
                            kind: 'media',
                            id: item.id,
                        })}
                        aria-current={item.id === selectedId ? 'true' : undefined}>
                        <img className="k-media-tile__thumb" src={resolveUrl(`${item.url}?w=480`)} alt="" loading="lazy" />
                        <span className="k-media-tile__text">
                            <span className="k-media-tile__name k-ellipsis">{item.filename}</span>
                            <span className="k-media-tile__detail">
                                {bytesOf(item.size)} · {item.width} × {item.height}
                            </span>
                            <span className="k-media-tile__detail">{usageOf(item.uses)}</span>
                        </span>
                    </a>
                </li>
            ))}
        </ul>
    );
}

function MediaTable({ items, selectedId }: { items: readonly MediaItem[]; selectedId: string | undefined }) {
    const { resolveUrl } = useEditorContext();
    return (
        <div className="k-table__scroll">
            <table className="k-table k-media-table" aria-label="Images">
                <thead>
                    <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Size</th>
                        <th scope="col">Dimensions</th>
                        <th scope="col">Used on</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="k-table__row" data-selected={item.id === selectedId ? '' : undefined}>
                            <td className="k-table__title">
                                <a
                                    className="k-media-table__name"
                                    href={hrefOf({
                                        kind: 'media',
                                        id: item.id,
                                    })}
                                    aria-current={item.id === selectedId ? 'true' : undefined}>
                                    <img className="k-media-table__thumb" src={resolveUrl(`${item.url}?w=120`)} alt="" loading="lazy" />
                                    <span className="k-ellipsis">{item.filename}</span>
                                </a>
                            </td>
                            <td>{bytesOf(item.size)}</td>
                            <td>
                                {item.width} × {item.height}
                            </td>
                            <td>{item.uses === 0 ? 'Unused' : item.uses === 1 ? '1 page' : `${item.uses} pages`}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * Where a use leads, what it is called, and the line under it: the field
 * holding the image, after the collection for an item.
 */
const useRowOf = (
    use: MediaUse,
    collectionLabel: (name: string) => string | undefined
): { href: string; title: string; detail: string } => {
    const ref = parseRef(use.ref);
    const fields = use.fieldPaths.map(fieldLabelOf).join('; ');
    const place = use.published ? fields : `${fields}, in a draft`;
    const href = hrefOf({
        kind: 'document',
        ref: use.ref,
    });
    if (ref?.type === 'item') {
        return {
            href,
            title: use.label ?? 'Untitled',
            detail: `${collectionLabel(ref.collection) ?? humanize(ref.collection)}, ${place}`,
        };
    }
    return {
        href,
        title: use.label ?? (ref === undefined ? use.ref : humanize(ref.name)),
        detail: place,
    };
};

/**
 * One image beside the library: the image large, where a click sets its
 * focal point, its alt text, the pages that use it, and its file's facts,
 * with Save and a menu holding Copy link and Delete.
 */
function MediaDetails({
    connection,
    item,
    people,
    collectionLabel,
    onSaved,
    onDeleted,
}: {
    connection: Connection;
    item: MediaItem;
    people: People | undefined;
    collectionLabel: (name: string) => string | undefined;
    onSaved: (item: MediaItem) => void;
    onDeleted: () => void;
}) {
    const { resolveUrl } = useEditorContext();
    const toasts = Toast.useToastManager();
    const [alt, setAlt] = useState(item.alt);
    const [focal, setFocal] = useState(item.focalPoint);
    const [uses, setUses] = useState<MediaUse[] | undefined>();
    const [saving, setSaving] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
    const [confirming, setConfirming] = useState(false);
    const panel = useRef<HTMLElement>(null);

    // Stacked above the images on a narrow screen, the details come into view when opened. Beside them they stay in view anyway.
    useEffect(() => {
        if (panel.current === null || window.getComputedStyle(panel.current).position === 'sticky') return;
        panel.current.scrollIntoView({
            block: 'nearest',
        });
    }, []);

    useEffect(() => {
        void connection
            .call<{ uses: MediaUse[] }>('editing_media_uses', {
                params: {
                    id: item.id,
                },
            })
            .then((answer) => setUses(answer.status === 200 ? answer.body.uses : []));
    }, [connection, item.id]);

    const changed = alt !== item.alt || focal?.x !== item.focalPoint?.x || focal?.y !== item.focalPoint?.y;
    const useCount = uses?.length ?? item.uses;
    const uploader = people?.people.find((person) => person.id === item.uploadedBy)?.name ?? item.uploadedBy;
    const url = resolveUrl(item.url);

    const save = async (): Promise<void> => {
        setSaving(true);
        setProblem(undefined);
        const answer = await connection.call<Omit<MediaItem, 'uses'>>('editing_media_update', {
            params: {
                id: item.id,
            },
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
        });
        if (answer.status >= 300) {
            setProblem(problemOf(answer, 'It was not deleted'));
            return;
        }
        toasts.add({
            description: `Deleted ${item.filename}.`,
        });
        onDeleted();
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
                    <a
                        className="k-icon-button"
                        href={hrefOf({
                            kind: 'media',
                        })}
                        aria-label="Close details">
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
            <div className="k-media-details__group" role="group" aria-labelledby="k-media-used">
                <span id="k-media-used" className="k-row__label">
                    {useCount === 0 ? 'Used on' : usageOf(useCount)}
                </span>
                {uses === undefined ? (
                    <LoaderCircle {...ICON} className="k-spin" />
                ) : uses.length === 0 ? (
                    <p className="k-help">Nothing uses this image yet. Deleting it changes no page.</p>
                ) : (
                    <ul className="k-media-details__uses">
                        {uses.map((use) => {
                            const row = useRowOf(use, collectionLabel);
                            return (
                                <li key={use.ref}>
                                    <a className="k-media-details__use" href={row.href}>
                                        <span className="k-media-details__use-text">
                                            <span className="k-media-details__use-title k-ellipsis">{row.title}</span>
                                            <span className="k-media-details__use-detail k-ellipsis">{row.detail}</span>
                                        </span>
                                        <ChevronRight {...ICON} />
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                )}
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
                        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="5" cy="12" r="1.6" fill="currentColor" />
                            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                            <circle cx="19" cy="12" r="1.6" fill="currentColor" />
                        </svg>
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
                                <Menu.Item className="k-menu__item" onClick={() => setConfirming(true)}>
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
                              question: deleteQuestionOf(item.filename, useCount),
                          }
                        : undefined
                }
                onConfirm={() => void remove()}
                onCancel={() => setConfirming(false)}
            />
        </aside>
    );
}
