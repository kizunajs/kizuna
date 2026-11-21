import { memo, useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
    Background,
    BackgroundVariant,
    BaseEdge,
    getBezierPath,
    Handle,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type Edge,
    type EdgeProps,
    type Node,
    type NodeProps,
} from '@xyflow/react';
import { File, Maximize, Search, SquareArrowOutUpRight, X } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { parseRef } from '../refs.js';
import type { AdminSite } from './config.js';
import {
    domainLetterOf,
    linkCardsMatching,
    linkFiltersOf,
    linkMapLayoutOf,
    linksPillOf,
    shownLinesOf,
    type LinkCard,
    type LinkColumn,
    type LinkFilter,
    type LinkHead,
    type LinkMapAnswer,
    type LinkNode,
} from './link-map-layout.js';
import { CARD_HEIGHT, CARD_WIDTH } from './map-layout.js';
import { hrefOf, SHARED_GROUP } from './navigation.js';
import { PageHeader } from './page-header.js';
import { Loading, problemOf } from './parts.js';
import { BandPill, seoHrefOf, siteQueryOf } from './seo-screen.js';
import type { LinkEnd, PageLinksAnswer } from './seo-screens.js';
import { SiteIcon } from './site-switcher.js';

const FIT = {
    padding: 0.08,
    maxZoom: 1,
};

const PRO_OPTIONS = {
    hideAttribution: true,
};

const FILTERS: ReadonlyArray<{ key: LinkFilter; text: (count: number) => string; band: 'poor' | 'fair' }> = [
    {
        key: 'orphans',
        text: (count) => `${count} nothing links to`,
        band: 'poor',
    },
    {
        key: 'broken',
        text: (count) => (count === 1 ? '1 broken link' : `${count} broken links`),
        band: 'poor',
    },
    {
        key: 'one-in',
        text: (count) => `${count} with one link in`,
        band: 'fair',
    },
];

const urlOf = (domain: string, path: string | undefined): string => `https://${domain}${path ?? ''}`;

/**
 * A domain's mark: its icon, or its first letter on a tile.
 */
function DomainTile({ domain, favicon }: { domain: string; favicon?: string | undefined }) {
    if (favicon !== undefined) return <img className="k-domain-tile" src={favicon} alt="" width={20} height={20} />;
    return (
        <span className="k-domain-tile" aria-hidden="true">
            {domainLetterOf(domain)}
        </span>
    );
}

/**
 * The mark beside a page of the CMS: its site's, Shared's, or a page with
 * one site.
 */
function PageMark({ site, sites }: { site: string | null | undefined; sites: readonly AdminSite[] }) {
    if (sites.length === 0) {
        return (
            <span className="k-domain-tile" aria-hidden="true">
                <File {...ICON} size={13} />
            </span>
        );
    }
    return <SiteIcon site={sites.find((candidate) => candidate.key === site)} />;
}

interface HeadData extends Record<string, unknown> {
    head: LinkHead;
    label: string;
    width: number;
}

interface CardData extends Record<string, unknown> {
    card: LinkCard;
    sites: readonly AdminSite[];
    selected: boolean;
    found: boolean;
    dimmed: boolean;
    onSelect: (id: string) => void;
}

interface LineData extends Record<string, unknown> {
    broken: boolean;
    external: boolean;
}

/**
 * A column's head, with a tag on the columns that are other sites.
 */
const ColumnHead = memo(function ColumnHead({ data }: NodeProps<Node<HeadData>>) {
    const external = data.head.column === 'in' || data.head.column === 'out';
    return (
        <div
            className="k-link-map__head"
            style={{
                width: data.width,
            }}>
            <span className="k-link-map__head-name">{data.label}</span>
            {external ? (
                <span className="k-link-map__tag">
                    <SquareArrowOutUpRight {...ICON} size={12} />
                    Other sites
                </span>
            ) : null}
        </div>
    );
});

const HANDLES = (
    <>
        <Handle type="target" position={Position.Left} id="left-target" isConnectable={false} />
        <Handle type="source" position={Position.Left} id="left-source" isConnectable={false} />
        <Handle type="target" position={Position.Right} id="right-target" isConnectable={false} />
        <Handle type="source" position={Position.Right} id="right-source" isConnectable={false} />
    </>
);

/**
 * A card: a page with how many links reach it, another site with an arrow
 * out to it, or a broken target in red.
 */
const LinkMapCard = memo(function LinkMapCard({ data }: NodeProps<Node<CardData>>) {
    const { card } = data;
    const node = card.node;
    const attributes = {
        className: 'k-map__card k-link-map__card',
        'data-kind': node.kind,
        'data-selected': data.selected ? '' : undefined,
        'data-found': data.found ? '' : undefined,
        'data-dimmed': data.dimmed ? '' : undefined,
        style: {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
        },
    };
    const text = (title: string) => (
        <span className="k-map__card-text">
            <span className="k-map__card-title k-ellipsis">{title}</span>
            {card.detail === '' ? null : <span className="k-map__card-path k-ellipsis">{card.detail}</span>}
        </span>
    );
    if (node.kind === 'segment') {
        return (
            <>
                {HANDLES}
                <div {...attributes}>{text(node.title)}</div>
            </>
        );
    }
    if (node.kind === 'broken') {
        return (
            <>
                {HANDLES}
                <div {...attributes}>{text(node.title)}</div>
            </>
        );
    }
    if (node.kind === 'external') {
        return (
            <>
                {HANDLES}
                <a {...attributes} href={urlOf(node.domain, node.path)} target="_blank" rel="noreferrer" draggable={false}>
                    <DomainTile domain={node.domain} favicon={node.favicon} />
                    {text(node.domain)}
                    <SquareArrowOutUpRight {...ICON} size={14} className="k-link-map__out" />
                </a>
            </>
        );
    }
    const pill = linksPillOf(node);
    return (
        <>
            {HANDLES}
            <button
                type="button"
                {...attributes}
                aria-pressed={data.selected}
                aria-label={`${node.title}, ${pill.text}`}
                onClick={() => data.onSelect(node.id)}>
                {card.column === 'site' && data.sites.length > 0 ? <PageMark site={node.site} sites={data.sites} /> : null}
                {text(node.title)}
                <BandPill band={pill.band}>{pill.text}</BandPill>
            </button>
        </>
    );
});

/**
 * A link: solid between pages, dotted to another site, and dashed red to a
 * target that is gone.
 */
const LinkMapLine = memo(function LinkMapLine(props: EdgeProps<Edge<LineData>>) {
    const [path] = getBezierPath(props);
    return (
        <BaseEdge
            path={path}
            className="k-link-map__line"
            data-broken={props.data?.broken === true ? '' : undefined}
            data-external={props.data?.external === true ? '' : undefined}
        />
    );
});

const NODE_TYPES = {
    head: ColumnHead,
    card: LinkMapCard,
};

const EDGE_TYPES = {
    line: LinkMapLine,
};

/**
 * One row of the inspector: a mark, a title over a grey line, and what to do
 * about it on the right.
 */
function InspectorRow({ mark, title, detail, end }: { mark: ReactNode; title: ReactNode; detail?: string | undefined; end?: ReactNode }) {
    return (
        <li className="k-link-map__row">
            {mark}
            <span className="k-link-map__row-text">
                <span className="k-link-map__row-title k-ellipsis">{title}</span>
                {detail === undefined || detail === '' ? null : <span className="k-link-map__row-detail k-ellipsis">{detail}</span>}
            </span>
            {end}
        </li>
    );
}

const quoted = (text: string): string => `“${text}”`;

const documentHref = (ref: string): string =>
    hrefOf({
        kind: 'document',
        ref,
    });

/**
 * A link's other end as a row: a page to open, another site to visit, or a
 * broken target to fix in the page that holds it.
 */
function EndRow({ end, sites, fixRef }: { end: LinkEnd; sites: readonly AdminSite[]; fixRef: string | undefined }) {
    const detail = end.anchor === undefined ? end.path : quoted(end.anchor);
    if (end.kind === 'external') {
        const domain = end.domain ?? end.title;
        return (
            <InspectorRow
                mark={<DomainTile domain={domain} />}
                title={domain}
                detail={detail}
                end={
                    <a
                        className="k-icon-button k-link-map__visit"
                        href={urlOf(domain, end.path)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${domain}`}>
                        <SquareArrowOutUpRight {...ICON} size={14} />
                    </a>
                }
            />
        );
    }
    if (end.kind === 'broken') {
        return (
            <InspectorRow
                mark={
                    <span className="k-domain-tile k-domain-tile--broken" aria-hidden="true">
                        !
                    </span>
                }
                title={end.title}
                detail={end.reason === 'trash' ? 'In the trash' : 'No page here'}
                end={
                    fixRef === undefined ? undefined : (
                        <a className="k-button k-button--secondary k-button--small" href={documentHref(fixRef)}>
                            Fix
                        </a>
                    )
                }
            />
        );
    }
    return (
        <InspectorRow
            mark={<PageMark site={end.ref === undefined ? undefined : (parseRef(end.ref)?.site ?? null)} sites={sites} />}
            title={end.ref === undefined ? end.title : <a href={documentHref(end.ref)}>{end.title}</a>}
            detail={detail}
        />
    );
}

/**
 * The card on the right for the page chosen: what links to it and with
 * which words, where it links, and the pages that could link to it.
 */
function Inspector({
    connection,
    page,
    sites,
    onClose,
}: {
    connection: Connection;
    page: Extract<LinkNode, { kind: 'page' }>;
    sites: readonly AdminSite[];
    onClose: () => void;
}) {
    const [answer, setAnswer] = useState<PageLinksAnswer | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    useEffect(() => {
        setAnswer(undefined);
        setProblem(undefined);
        let current = true;
        void connection
            .call<PageLinksAnswer>('editing_page_seo', {
                query: {
                    ref: page.ref,
                },
            })
            .then((reply) => {
                if (!current) return;
                if (reply.status !== 200) {
                    setProblem(problemOf(reply, 'The links did not load'));
                    return;
                }
                setAnswer(reply.body);
            });
        return () => {
            current = false;
        };
    }, [connection, page.ref]);

    const section = (title: string, count: number, rows: ReactNode) => (
        <section className="k-link-map__section" aria-label={title}>
            <h3 className="k-link-map__section-title">
                {title}
                <span className="k-link-map__count">{count}</span>
            </h3>
            {count === 0 ? null : <ul className="k-link-map__rows">{rows}</ul>}
        </section>
    );

    return (
        <aside className="k-link-map__inspector" aria-label={page.title}>
            <header className="k-link-map__inspector-head">
                <span className="k-link-map__inspector-text">
                    <a className="k-link-map__inspector-title k-ellipsis" href={documentHref(page.ref)}>
                        {page.title}
                    </a>
                    {page.path === null ? null : <span className="k-link-map__inspector-path k-ellipsis">{page.path}</span>}
                </span>
                <button type="button" className="k-icon-button" aria-label="Close" onClick={onClose}>
                    <X {...ICON} />
                </button>
            </header>
            {answer === undefined ? (
                <Loading problem={problem} />
            ) : (
                <div className="k-link-map__sections">
                    {section(
                        'Links here',
                        answer.links.in.length,
                        answer.links.in.map((end, index) => <EndRow key={index} end={end} sites={sites} fixRef={undefined} />)
                    )}
                    {section(
                        'Links from here',
                        answer.links.out.length,
                        answer.links.out.map((end, index) => <EndRow key={index} end={end} sites={sites} fixRef={page.ref} />)
                    )}
                    {answer.couldLinkHere.length === 0
                        ? null
                        : section(
                              'Could link here',
                              answer.couldLinkHere.length,
                              answer.couldLinkHere.map((candidate) => (
                                  <InspectorRow
                                      key={candidate.ref}
                                      mark={<PageMark site={parseRef(candidate.ref)?.site ?? null} sites={sites} />}
                                      title={candidate.title}
                                      detail={quoted(candidate.phrase)}
                                      end={
                                          <a className="k-button k-button--secondary k-button--small" href={documentHref(candidate.ref)}>
                                              Add link
                                          </a>
                                      }
                                  />
                              ))
                          )}
                </div>
            )}
        </aside>
    );
}

function LinkMapCanvas({
    answer,
    connection,
    sites,
    site,
    filter,
    header,
}: {
    answer: LinkMapAnswer;
    connection: Connection;
    sites: readonly AdminSite[];
    site: string | undefined;
    filter: LinkFilter | undefined;
    header: (search: ReactNode, fit: () => void) => ReactNode;
}) {
    const flow = useReactFlow();
    const [selected, setSelected] = useState<string | undefined>();
    const [search, setSearch] = useState('');
    const [foundIndex, setFoundIndex] = useState(0);
    const layout = useMemo(() => linkMapLayoutOf(answer, site), [answer, site]);
    const filters = useMemo(() => linkFiltersOf(answer), [answer]);
    const found = useMemo(() => linkCardsMatching(layout, search), [layout, search]);
    const foundCard = found.length === 0 ? undefined : found[foundIndex % found.length];
    const picked = filter === undefined ? undefined : filters[filter].cards;
    const selectedPage = answer.nodes.find(
        (node): node is Extract<LinkNode, { kind: 'page' }> => node.kind === 'page' && node.id === selected
    );
    const select = useCallback((id: string) => setSelected((shown) => (shown === id ? undefined : id)), []);

    useEffect(() => {
        const close = (event: globalThis.KeyboardEvent): void => {
            if (event.key === 'Escape') setSelected(undefined);
        };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, []);

    const siteLabel = sites.find((candidate) => candidate.key === site)?.label ?? 'Pages';

    const nodes = useMemo<Node[]>(() => {
        const headLabel = (column: LinkColumn): string =>
            column === 'in' ? 'Links in' : column === 'out' ? 'Links out' : column === 'shared' ? SHARED_GROUP : siteLabel;
        return [
            ...layout.heads.map((head): Node<HeadData> => {
                const width = head.column === 'site' || head.column === 'shared' ? layout.siteWidth : CARD_WIDTH;
                return {
                    id: head.id,
                    type: 'head',
                    position: {
                        x: head.x,
                        y: head.y,
                    },
                    width,
                    height: 44,
                    data: {
                        head,
                        label: headLabel(head.column),
                        width,
                    },
                    selectable: false,
                    focusable: false,
                };
            }),
            ...layout.cards.map((card): Node<CardData> => ({
                id: card.id,
                type: 'card',
                position: {
                    x: card.x,
                    y: card.y,
                },
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                data: {
                    card,
                    sites,
                    selected: card.id === selected,
                    found: card.id === foundCard?.id,
                    dimmed: picked !== undefined && !picked.has(card.id),
                    onSelect: select,
                },
                selectable: false,
                focusable: false,
            })),
        ];
    }, [layout, sites, selected, foundCard, picked, select, siteLabel]);

    const edges = useMemo<Edge[]>(
        () =>
            shownLinesOf(layout, selected).map((line): Edge<LineData> => ({
                id: line.id,
                source: line.from,
                target: line.to,
                sourceHandle: `${line.sourceHandle}-source`,
                targetHandle: `${line.targetHandle}-target`,
                type: 'line',
                selectable: false,
                focusable: false,
                data: {
                    broken: line.broken,
                    external: line.external,
                },
            })),
        [layout, selected]
    );

    const jumpTo = (card: LinkCard | undefined): void => {
        if (card === undefined) return;
        void flow.setCenter(card.x + CARD_WIDTH / 2, card.y + CARD_HEIGHT / 2, {
            zoom: Math.max(flow.getZoom(), 0.9),
            duration: 300,
        });
    };
    const onSearchKey = (event: KeyboardEvent<HTMLInputElement>): void => {
        if (event.key !== 'Enter' || found.length === 0) return;
        event.preventDefault();
        const next = foundCard === undefined ? 0 : (foundIndex + 1) % found.length;
        setFoundIndex(next);
        jumpTo(found[next]);
    };

    return (
        <>
            {header(
                <label className="k-list-toolbar__search">
                    <Search {...ICON} />
                    <span className="k-visually-hidden">Find a page</span>
                    <input
                        type="search"
                        value={search}
                        placeholder="Find a page"
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setFoundIndex(0);
                            jumpTo(linkCardsMatching(layout, event.target.value)[0]);
                        }}
                        onKeyDown={onSearchKey}
                    />
                </label>,
                () => void flow.fitView(FIT)
            )}
            <div className="k-map__canvas k-link-map__canvas" data-filtering={picked === undefined ? undefined : ''}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={NODE_TYPES}
                    edgeTypes={EDGE_TYPES}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    edgesFocusable={false}
                    nodesFocusable={false}
                    minZoom={0.15}
                    maxZoom={1.75}
                    fitView
                    fitViewOptions={FIT}
                    onPaneClick={() => setSelected(undefined)}
                    proOptions={PRO_OPTIONS}>
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                </ReactFlow>
                {selectedPage === undefined ? null : (
                    <Inspector connection={connection} page={selectedPage} sites={sites} onClose={() => setSelected(undefined)} />
                )}
            </div>
        </>
    );
}

/**
 * Link map: the other sites that link in, the site's pages with how many
 * links reach each, and the links out. Broken links always show, and a
 * page's own links when it is chosen, with the card that says what links to
 * it, where it links and what could link to it.
 */
export function LinkMapScreen({
    connection,
    sites,
    site,
}: {
    connection: Connection;
    sites: readonly AdminSite[];
    site: string | undefined;
}) {
    const [answer, setAnswer] = useState<LinkMapAnswer | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [filter, setFilter] = useState<LinkFilter | undefined>();
    useEffect(() => {
        setAnswer(undefined);
        void connection.call<LinkMapAnswer>('editing_link_map', siteQueryOf(site)).then((reply) => {
            if (reply.status !== 200) {
                setProblem(problemOf(reply, 'The link map did not load'));
                return;
            }
            setAnswer(reply.body);
        });
    }, [connection, site]);

    const counts = useMemo(() => (answer === undefined ? undefined : linkFiltersOf(answer)), [answer]);
    const pages = answer?.nodes.filter((node) => node.kind === 'page').length ?? 0;
    const linkingIn = useMemo(() => {
        const external = new Set(answer?.nodes.filter((node) => node.kind === 'external').map((node) => node.id));
        return new Set(answer?.edges.filter((edge) => external.has(edge.from)).map((edge) => edge.from));
    }, [answer]);
    const linksOut = answer?.nodes.filter((node) => node.kind !== 'page' && !linkingIn.has(node.id)).length ?? 0;

    const header = (search?: ReactNode, fit?: () => void) => (
        <PageHeader
            title="Link map"
            crumbs={[
                {
                    label: 'SEO',
                    href: seoHrefOf('seo', site),
                },
            ]}
            meta={
                answer === undefined
                    ? []
                    : [
                          {
                              label: 'Pages',
                              value: String(pages),
                          },
                          {
                              label: 'Other sites linking in',
                              value: String(linkingIn.size),
                          },
                          {
                              label: 'Links out',
                              value: String(linksOut),
                          },
                      ]
            }
            tabs={
                search === undefined ? undefined : (
                    <div className="k-list-toolbar k-map__toolbar">
                        {search}
                        <div className="k-list-toolbar__buttons k-map__filters">
                            <div className="k-link-map__filters" role="group" aria-label="Show only">
                                {FILTERS.filter((shown) => (counts?.[shown.key].count ?? 0) > 0).map((shown) => (
                                    <button
                                        key={shown.key}
                                        type="button"
                                        className="k-band-pill k-link-map__filter"
                                        data-band={shown.band}
                                        aria-pressed={filter === shown.key}
                                        onClick={() => setFilter((current) => (current === shown.key ? undefined : shown.key))}>
                                        {shown.text(counts?.[shown.key].count ?? 0)}
                                    </button>
                                ))}
                            </div>
                            {fit === undefined ? null : (
                                <button type="button" className="k-icon-button" aria-label="Fit to view" title="Fit to view" onClick={fit}>
                                    <Maximize {...ICON} />
                                </button>
                            )}
                        </div>
                    </div>
                )
            }
        />
    );

    return (
        <div className="k-map k-link-map">
            {answer === undefined ? (
                <>
                    {header()}
                    <div className="k-admin__body">
                        <Loading problem={problem} />
                    </div>
                </>
            ) : (
                <ReactFlowProvider>
                    <LinkMapCanvas answer={answer} connection={connection} sites={sites} site={site} filter={filter} header={header} />
                </ReactFlowProvider>
            )}
        </div>
    );
}
