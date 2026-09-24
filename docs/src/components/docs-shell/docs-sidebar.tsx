'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpRight, ChevronRight, FileText } from 'lucide-react';
import type * as PageTree from 'fumadocs-core/page-tree';
import GithubIcon from '@/icons/Github.svg';
import { Badge } from '@/components/shared/badge';
import { githubUrl, version } from '@/lib/site';
import styles from './docs-sidebar.module.css';

function containsPath(folder: PageTree.Folder, pathname: string): boolean {
    if (folder.index?.url === pathname) return true;
    return folder.children.some((child) => {
        if (child.type === 'page') return child.url === pathname;
        if (child.type === 'folder') return containsPath(child, pathname);
        return false;
    });
}

function PageLink({ item, pathname }: { item: PageTree.Item; pathname: string }) {
    const active = item.url === pathname;

    return (
        <Link href={item.url} className={clsx(styles.link, active && styles.linkActive)} aria-current={active ? 'page' : undefined}>
            {item.name}
        </Link>
    );
}

function FolderNode({ folder, pathname }: { folder: PageTree.Folder; pathname: string }) {
    const [open, setOpen] = useState(() => folder.defaultOpen === true || containsPath(folder, pathname));
    const active = folder.index?.url === pathname;

    return (
        <div className={styles.folder}>
            <div className={clsx(styles.folderRow, active && styles.linkActive)}>
                {folder.index ? (
                    <Link
                        href={folder.index.url}
                        className={styles.folderLink}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setOpen(true)}>
                        {folder.name}
                    </Link>
                ) : (
                    <button
                        type="button"
                        className={clsx(styles.folderLink, styles.folderButton)}
                        aria-expanded={open}
                        onClick={() => setOpen((current) => !current)}>
                        {folder.name}
                    </button>
                )}
                <button
                    type="button"
                    className={styles.toggle}
                    aria-expanded={open}
                    aria-label={open ? 'Collapse section' : 'Expand section'}
                    onClick={() => setOpen((current) => !current)}>
                    <ChevronRight className={clsx(styles.chevron, open && styles.chevronOpen)} aria-hidden />
                </button>
            </div>
            {open ? (
                <div className={styles.folderChildren}>
                    <Nodes nodes={folder.children} pathname={pathname} />
                </div>
            ) : null}
        </div>
    );
}

function Nodes({ nodes, pathname }: { nodes: PageTree.Node[]; pathname: string }) {
    return (
        <>
            {nodes.map((node, index) => {
                if (node.type === 'separator') {
                    return (
                        <p key={node.$id ?? index} className={styles.section}>
                            {node.name}
                        </p>
                    );
                }
                if (node.type === 'folder') {
                    return <FolderNode key={node.$id ?? index} folder={node} pathname={pathname} />;
                }
                return <PageLink key={node.$id ?? node.url} item={node} pathname={pathname} />;
            })}
        </>
    );
}

export function DocsSidebar({ tree, className }: { tree: PageTree.Root; className?: string }) {
    const pathname = usePathname();

    return (
        <nav className={clsx(styles.sidebar, className)} aria-label="Docs">
            <Nodes nodes={tree.children} pathname={pathname} />
        </nav>
    );
}

/**
 * The sidebar between a pinned version row and a pinned row of links, with only
 * the page list scrolling.
 */
export function DocsSidebarPanel({ tree, className }: { tree: PageTree.Root; className?: string }) {
    return (
        <div className={clsx(styles.panel, className)}>
            <a href={`${githubUrl}/releases/tag/v${version}`} className={styles.version} target="_blank" rel="noreferrer">
                <span className={styles.versionNumber}>v{version}</span>
                <Badge stage="beta" />
                <ArrowUpRight className={styles.versionIcon} aria-hidden />
            </a>
            <div className={styles.scroll}>
                <DocsSidebar tree={tree} />
            </div>
            <div className={styles.links}>
                <a href="/llms.txt" className={styles.footerLink} target="_blank" rel="noreferrer">
                    <FileText className={styles.footerIcon} aria-hidden />
                    llms.txt
                </a>
                <a href={githubUrl} className={styles.footerLink} target="_blank" rel="noreferrer">
                    <GithubIcon className={styles.footerIcon} aria-hidden />
                    GitHub
                </a>
            </div>
        </div>
    );
}
