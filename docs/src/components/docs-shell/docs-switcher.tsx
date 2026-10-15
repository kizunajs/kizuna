'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, PenLine, Route, type LucideIcon } from 'lucide-react';
import type * as PageTree from 'fumadocs-core/page-tree';
import styles from './docs-switcher.module.css';

/**
 * One tab of the docs: the core tree, or a folder whose `meta.json` says
 * `root: true`.
 */
export interface DocsTab {
    id: string;
    icon: LucideIcon;
    name: ReactNode;
    description?: ReactNode;
    url: string;
    nodes: PageTree.Node[];
}

const containsPath = (folder: PageTree.Folder, pathname: string): boolean => {
    if (folder.index?.url === pathname) return true;
    return folder.children.some((child) => {
        if (child.type === 'page') return child.url === pathname;
        if (child.type === 'folder') return containsPath(child, pathname);
        return false;
    });
};

const isRootFolder = (node: PageTree.Node): node is PageTree.Folder => node.type === 'folder' && node.root === true;

/**
 * The icon each tab shows, keyed by the folder's id. The core docs are
 * routes, and the CMS is writing.
 */
const icons: Record<string, LucideIcon> = {
    core: Route,
    cms: PenLine,
};

const iconOf = (id: string): LucideIcon => icons[id] ?? Route;

const firstUrl = (nodes: PageTree.Node[]): string | undefined => {
    for (const node of nodes) {
        if (node.type === 'page') return node.url;
        if (node.type === 'folder') {
            const url = node.index?.url ?? firstUrl(node.children);
            if (url !== undefined) return url;
        }
    }
    return undefined;
};

/**
 * The tabs a page tree splits into, the core docs first, and the one the
 * current page belongs to.
 */
export function tabsOf(tree: PageTree.Root, pathname: string): { tabs: DocsTab[]; active: DocsTab } {
    const roots = tree.children.filter(isRootFolder);
    const core: DocsTab = {
        id: 'core',
        icon: Route,
        name: tree.name,
        description: tree.description,
        url: firstUrl(tree.children) ?? '/docs',
        nodes: tree.children.filter((node) => !isRootFolder(node)),
    };
    const tabs = [
        core,
        ...roots.map((folder) => ({
            id: folder.$id ?? String(folder.name),
            icon: iconOf(folder.$id ?? ''),
            name: folder.name,
            description: folder.description,
            url: folder.index?.url ?? firstUrl(folder.children) ?? '/docs',
            nodes: folder.children,
        })),
    ];
    const activeRoot = roots.find((folder) => containsPath(folder, pathname));
    const active = activeRoot === undefined ? core : tabs.find((tab) => tab.nodes === activeRoot.children)!;
    return {
        tabs,
        active,
    };
}

export function DocsSwitcher({ tabs, active }: { tabs: DocsTab[]; active: DocsTab }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', closeOutside);
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOutside);
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    return (
        <div ref={rootRef} className={styles.root}>
            <button
                type="button"
                className={styles.trigger}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}>
                <span className={styles.iconBox}>
                    <active.icon className={styles.icon} aria-hidden />
                </span>
                <span className={styles.name}>{active.name}</span>
                <ChevronsUpDown className={styles.chevron} aria-hidden />
            </button>
            {open ? (
                <div className={styles.menu} role="menu">
                    {tabs.map((tab) => {
                        const current = tab.id === active.id;
                        return (
                            <Link
                                key={tab.id}
                                href={tab.url}
                                role="menuitem"
                                className={clsx(styles.item, current && styles.itemActive)}
                                aria-current={current ? 'true' : undefined}
                                onClick={() => setOpen(false)}>
                                <span className={styles.iconBox}>
                                    <tab.icon className={styles.icon} aria-hidden />
                                </span>
                                <span className={styles.itemText}>
                                    <span className={styles.name}>{tab.name}</span>
                                    {tab.description ? <span className={styles.description}>{tab.description}</span> : null}
                                </span>
                                {current ? <Check className={styles.check} aria-hidden /> : null}
                            </Link>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
