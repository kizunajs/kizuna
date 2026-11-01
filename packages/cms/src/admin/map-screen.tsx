import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
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
import { ChevronDown, ChevronRight, Maximize, Search } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import type { PageMap } from '../page-map.js';
import type { AdminSite } from './config.js';
import { CARD_HEIGHT, CARD_WIDTH, cardsMatching, connectedTo, mapLayoutOf, type MapCard, type MapColumn } from './map-layout.js';
import { hrefOf, SHARED_GROUP } from './navigation.js';
import { PageHeader } from './page-header.js';
import { Loading, problemOf, statusLabelOf } from './parts.js';
import { SiteIcon } from './site-switcher.js';

/**
 * The key the filter gives the shared content, beside the sites' own keys.
 */
const SHARED = '';

const hostOf = (url: string | undefined): string | undefined => {
    if (url === undefined) return undefined;
    try {
        return new URL(url).host;
    } catch {
        return undefined;
    }
};

const keyOf = (site: string | null): string => site ?? SHARED;

interface HeadData extends Record<string, unknown> {
    column: MapColumn;
    site: AdminSite | undefined;
}

interface CardData extends Record<string, unknown> {
    card: MapCard;
    site: AdminSite | undefined;
    onToggle: (id: string) => void;
}

interface LinkData extends Record<string, unknown> {
    broken: boolean;
}

/**
 * A column's head: the site's mark, its name and its domain.
 */
const ColumnHead = memo(function ColumnHead({ data }: NodeProps<Node<HeadData>>) {
    const domain = hostOf(data.site?.url);
    return (
        <div
            className="k-map__head"
            style={{
                width: data.column.width,
            }}>
            <SiteIcon site={data.site} />
            <div className="k-map__head-text">
                <span className="k-map__head-name k-ellipsis">{data.site?.label ?? SHARED_GROUP}</span>
                {domain === undefined ? null : <span className="k-map__head-domain k-ellipsis">{domain}</span>}
            </div>
        </div>
    );
});

const countText = (count: number): string => `${count} ${count === 1 ? 'item' : 'items'}`;

/**
 * A page's card: its title, its path and its status, with the site's mark
 * when it belongs to one. A route that shows a collection folds its items
 * away under it.
 */
const PageCard = memo(function PageCard({ data }: NodeProps<Node<CardData>>) {
    const { card, site } = data;
    const node = card.node;
    const handles = (
        <>
            <Handle type="target" position={Position.Left} id="left-target" isConnectable={false} />
            <Handle type="source" position={Position.Left} id="left-source" isConnectable={false} />
            <Handle type="target" position={Position.Right} id="right-target" isConnectable={false} />
            <Handle type="source" position={Position.Right} id="right-source" isConnectable={false} />
            <Handle type="target" position={Position.Left} id="tree-target" isConnectable={false} className="k-map__tree-handle" />
            <Handle type="source" position={Position.Bottom} id="tree-source" isConnectable={false} className="k-map__tree-handle" />
        </>
    );
    const body = (
        <>
            {site === undefined ? null : <SiteIcon site={site} />}
            <span className="k-map__card-text">
                <span className="k-map__card-title k-ellipsis">{node.title}</span>
                {node.path === null ? null : (
                    <span className="k-map__card-path k-ellipsis">
                        {node.path}
                        {node.kind === 'collection' ? ` · ${countText(node.count ?? 0)}` : ''}
                    </span>
                )}
            </span>
        </>
    );
    const attributes = {
        className: 'k-map__card',
        'data-kind': node.kind,
        style: {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
        },
    };
    if (node.kind === 'segment') {
        return (
            <>
                {handles}
                <div {...attributes}>{body}</div>
            </>
        );
    }
    if (node.kind === 'collection') {
        const Chevron = card.expanded === true ? ChevronDown : ChevronRight;
        return (
            <>
                {handles}
                <button
                    type="button"
                    {...attributes}
                    aria-expanded={card.expanded === true}
                    aria-label={`${node.title}, ${countText(node.count ?? 0)}`}
                    onClick={() => data.onToggle(node.id)}>
                    {body}
                    <Chevron {...ICON} className="k-map__chevron" />
                </button>
            </>
        );
    }
    return (
        <>
            {handles}
            <a
                {...attributes}
                draggable={false}
                href={hrefOf({
                    kind: 'document',
                    ref: node.ref!,
                })}>
                {body}
                <span
                    className="k-map__dot"
                    data-status={node.status}
                    title={node.status === 'missing' ? 'Missing' : statusLabelOf(node.status)}
                />
            </a>
        </>
    );
});

/**
 * A content link: a curve from the holder to the page it links to, dashed
 * when the target is not live.
 */
const LinkLine = memo(function LinkLine(props: EdgeProps<Edge<LinkData>>) {
    const [path] = getBezierPath(props);
    return (
        <BaseEdge path={path} interactionWidth={14} className="k-map__link" data-broken={props.data?.broken === true ? '' : undefined} />
    );
});

const NODE_TYPES = {
    head: ColumnHead,
    card: PageCard,
};

const EDGE_TYPES = {
    link: LinkLine,
};

const FIT = {
    padding: 0.08,
    maxZoom: 1,
};

/**
 * A value for an attribute selector, in quotes.
 */
const quoted = (value: string): string => `"${value.replace(/["\\]/g, '\\$&')}"`;

/**
 * How long the highlight stays after the pointer leaves a card, so moving
 * from one card to the next does not flash the whole map.
 */
const HOVER_GRACE_MS = 120;

function MapCanvas({
    map,
    sites,
    shown,
    filters,
    header,
}: {
    map: PageMap;
    sites: readonly AdminSite[];
    /**
     * The columns shown, by site key, `''` for the shared content.
     */
    shown: ReadonlySet<string>;
    filters: ReactNode;
    /**
     * The screen's header, given the search and the buttons to show in its
     * bar.
     */
    header: (tools: ReactNode) => ReactNode;
}) {
    const flow = useReactFlow();
    const canvas = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
    const [hoveredCard, setHoveredCard] = useState<string | undefined>();
    const leaving = useRef<number | undefined>(undefined);
    const [tip, setTip] = useState<{ label: string; x: number; y: number } | undefined>();
    const [search, setSearch] = useState('');
    const [foundIndex, setFoundIndex] = useState(0);
    const siteNamed = useCallback((key: string | null) => sites.find((site) => site.key === key), [sites]);
    const layout = useMemo(
        () =>
            mapLayoutOf(map, {
                // The shared content has a column only when something in it holds or receives a link.
                columns: [...sites.map((site) => site.key), ...(map.nodes.some((node) => node.site === null) ? [null] : [])].filter(
                    (site) => shown.has(keyOf(site))
                ),
                expanded,
            }),
        [map, sites, shown, expanded]
    );
    const found = useMemo(() => cardsMatching(layout, search), [layout, search]);
    const foundCard = found.length === 0 ? undefined : found[foundIndex % found.length];
    const lit = useMemo(() => (hoveredCard === undefined ? undefined : connectedTo(layout, hoveredCard)), [layout, hoveredCard]);
    const toggle = useCallback(
        (id: string) =>
            setExpanded((open) => {
                const next = new Set(open);
                if (!next.delete(id)) next.add(id);
                return next;
            }),
        []
    );

    // Nodes and edges change only with the layout. Hovering and finding restyle them through the stylesheet below, so React Flow never lays them out again.
    const nodes = useMemo<Node[]>(
        () => [
            ...layout.columns.map(
                (column): Node<HeadData> => ({
                    id: `head:${keyOf(column.site)}`,
                    type: 'head',
                    position: {
                        x: column.x,
                        y: column.y,
                    },
                    width: column.width,
                    height: 44,
                    data: {
                        column,
                        site: siteNamed(column.site),
                    },
                    selectable: false,
                    focusable: false,
                })
            ),
            ...layout.cards.map(
                (card): Node<CardData> => ({
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
                        site: siteNamed(card.node.site),
                        onToggle: toggle,
                    },
                    selectable: false,
                    focusable: false,
                })
            ),
        ],
        [layout, siteNamed, toggle]
    );

    const edges = useMemo<Edge[]>(
        () => [
            ...layout.treeLines.map(
                (line): Edge =>
                    ({
                        id: line.id,
                        source: line.from,
                        target: line.to,
                        sourceHandle: 'tree-source',
                        targetHandle: 'tree-target',
                        type: 'smoothstep',
                        className: 'k-map__tree',
                        selectable: false,
                        focusable: false,
                        pathOptions: {
                            borderRadius: 6,
                            offset: 0,
                        },
                    }) as Edge
            ),
            ...layout.links.map(
                (line): Edge<LinkData> => ({
                    id: line.id,
                    source: line.from,
                    target: line.to,
                    sourceHandle: `${line.sourceHandle}-source`,
                    targetHandle: `${line.targetHandle}-target`,
                    type: 'link',
                    selectable: false,
                    focusable: false,
                    data: {
                        broken: line.broken,
                    },
                })
            ),
        ],
        [layout]
    );

    const labels = useMemo(() => {
        const cards = new Map(layout.cards.map((card) => [card.id, card]));
        return new Map(
            layout.links.map((line) => {
                const target = cards.get(line.to);
                const domain = line.crossSite ? hostOf(siteNamed(target?.node.site ?? null)?.url) : undefined;
                return [
                    line.id,
                    [`To ${target?.node.title ?? ''}`, domain, line.broken ? 'Not live' : undefined]
                        .filter((part) => part !== undefined)
                        .join(' · '),
                ];
            })
        );
    }, [layout, siteNamed]);

    // The highlight as rules over the elements React Flow already drew: the hovered card's links and the cards they join, and the page found.
    const highlight = [
        lit === undefined
            ? ''
            : `.k-map__canvas[data-hovering] :is(${[...lit.cards].map((id) => `.react-flow__node[data-id=${quoted(id)}]`).join(', ')}) { opacity: 1; }`,
        lit === undefined || lit.links.size === 0
            ? ''
            : `.k-map__canvas[data-hovering] :is(${[...lit.links].map((id) => `.react-flow__edge[data-id=${quoted(id)}]`).join(', ')}) .k-map__link { stroke: var(--k-ink); stroke-width: 1.75; opacity: 1; }`,
        foundCard === undefined
            ? ''
            : `.react-flow__node[data-id=${quoted(foundCard.id)}] .k-map__card { box-shadow: inset 0 0 0 1.5px var(--k-ink); }`,
    ].join('\n');

    const enterCard = (id: string | undefined): void => {
        window.clearTimeout(leaving.current);
        setHoveredCard(id);
    };
    const leaveCard = (): void => {
        window.clearTimeout(leaving.current);
        leaving.current = window.setTimeout(() => setHoveredCard(undefined), HOVER_GRACE_MS);
    };
    useEffect(() => () => window.clearTimeout(leaving.current), []);

    const showTip = (event: MouseEvent, id: string): void => {
        const label = labels.get(id);
        const box = canvas.current?.getBoundingClientRect();
        if (label === undefined || box === undefined) return;
        setTip({
            label,
            x: event.clientX - box.left,
            y: event.clientY - box.top,
        });
    };

    const jumpTo = (card: MapCard | undefined): void => {
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
                <div className="k-list-toolbar k-map__toolbar">
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
                                jumpTo(cardsMatching(layout, event.target.value)[0]);
                            }}
                            onKeyDown={onSearchKey}
                        />
                    </label>
                    {search.trim() === '' ? null : (
                        <span className="k-map__found" role="status">
                            {found.length === 0 ? 'No pages' : `${(foundIndex % found.length) + 1} of ${found.length}`}
                        </span>
                    )}
                    <div className="k-list-toolbar__buttons k-map__filters">
                        {filters}
                        <button
                            type="button"
                            className="k-icon-button"
                            aria-label="Fit to view"
                            title="Fit to view"
                            onClick={() => void flow.fitView(FIT)}>
                            <Maximize {...ICON} />
                        </button>
                    </div>
                </div>
            )}
            <div ref={canvas} className="k-map__canvas" data-hovering={lit === undefined ? undefined : ''}>
                <style>{highlight}</style>
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
                    onNodeMouseEnter={(_, node) => enterCard(node.type === 'card' ? node.id : undefined)}
                    onNodeMouseLeave={leaveCard}
                    onEdgeMouseEnter={(event, edge) => showTip(event, edge.id)}
                    onEdgeMouseMove={(event, edge) => showTip(event, edge.id)}
                    onEdgeMouseLeave={() => setTip(undefined)}
                    proOptions={{
                        hideAttribution: true,
                    }}>
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                </ReactFlow>
                {tip === undefined ? null : (
                    <div
                        className="k-map__link-label"
                        style={{
                            left: tip.x + 12,
                            top: tip.y + 12,
                        }}>
                        {tip.label}
                    </div>
                )}
            </div>
        </>
    );
}

/**
 * Map: every page as a sitemap, one column per site and one for the shared
 * content when it holds or receives a link, each page under the page whose
 * path its own extends, and the content links between them across sites. In
 * a site it opens on that site and the shared content.
 */
export function MapScreen({ connection, sites, site }: { connection: Connection; sites: readonly AdminSite[]; site: string | undefined }) {
    const [map, setMap] = useState<PageMap | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const everyColumn = useMemo(() => [...sites.map((candidate) => candidate.key), SHARED], [sites]);
    const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set(site === undefined ? everyColumn : [site, SHARED]));
    useEffect(() => {
        setShown(new Set(site === undefined ? everyColumn : [site, SHARED]));
    }, [site, everyColumn]);
    useEffect(() => {
        void connection.call<PageMap>('editing_pages_map').then((answer) => {
            if (answer.status !== 200) {
                setProblem(problemOf(answer, 'The map did not load'));
                return;
            }
            setMap(answer.body);
        });
    }, [connection]);
    const toggle = (key: string): void => {
        const next = new Set(shown);
        if (!next.delete(key)) next.add(key);
        if (next.size > 0) setShown(next);
    };
    const pages = map?.nodes.filter((node) => node.kind === 'page' && (site === undefined || node.site === site)).length ?? 0;
    const links = map?.links.length ?? 0;
    const hasShared = map?.nodes.some((node) => node.site === null) === true;
    const filterButton = (key: string, label: string, mark: AdminSite | undefined) => (
        <button key={key} type="button" className="k-tab k-map__site" aria-pressed={shown.has(key)} onClick={() => toggle(key)}>
            <SiteIcon site={mark} />
            <span className="k-ellipsis">{label}</span>
        </button>
    );
    const filters = (
        <div className="k-map__sites" role="group" aria-label="Sites shown">
            {sites.map((candidate) => filterButton(candidate.key, candidate.label, candidate))}
            {hasShared ? filterButton(SHARED, SHARED_GROUP, undefined) : null}
        </div>
    );
    // The search and the site buttons sit in the header's bar, above its hairline, as tabs do on other screens.
    const header = (tools?: ReactNode) => (
        <PageHeader
            title="Map"
            meta={
                map === undefined
                    ? []
                    : [
                          {
                              label: 'Pages',
                              value: String(pages),
                          },
                          {
                              label: 'Links',
                              value: String(links),
                          },
                      ]
            }
            tabs={tools}
        />
    );
    return (
        <div className="k-map">
            {map === undefined ? (
                <>
                    {header()}
                    <div className="k-admin__body">
                        <Loading problem={problem} />
                    </div>
                </>
            ) : (
                <ReactFlowProvider>
                    <MapCanvas map={map} sites={sites} shown={shown} filters={filters} header={header} />
                </ReactFlowProvider>
            )}
        </div>
    );
}
