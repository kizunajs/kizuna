'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import type * as PageTree from 'fumadocs-core/page-tree';
import { DocsSidebarPanel } from './docs-sidebar';
import styles from './docs-mobile-nav.module.css';

type Location = {
    section?: ReactNode;
    page: ReactNode;
};

/**
 * The page at `pathname` and the section it sits under.
 */
function findLocation(nodes: PageTree.Node[], pathname: string, section?: ReactNode): Location | undefined {
    let current = section;
    for (const node of nodes) {
        if (node.type === 'separator') {
            current = node.name;
        } else if (node.type === 'page') {
            if (node.url === pathname) {
                return {
                    section: current,
                    page: node.name,
                };
            }
        } else {
            if (node.index?.url === pathname) {
                return {
                    section: current,
                    page: node.name,
                };
            }
            const found = findLocation(node.children, pathname, current);
            if (found) return found;
        }
    }
    return undefined;
}

export function DocsMobileNav({ tree }: { tree: PageTree.Root }) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const location = findLocation(tree.children, pathname);

    useEffect(() => setOpen(false), [pathname]);

    useEffect(() => {
        if (!open) return;

        menuRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
            block: 'center',
        });

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        const closeOnDesktop = (event: MediaQueryListEvent) => {
            if (event.matches) setOpen(false);
        };
        const desktop = window.matchMedia('(min-width: 1024px)');
        const root = document.documentElement;
        root.style.overflow = 'hidden';
        window.addEventListener('keydown', closeOnEscape);
        desktop.addEventListener('change', closeOnDesktop);
        return () => {
            root.style.overflow = '';
            window.removeEventListener('keydown', closeOnEscape);
            desktop.removeEventListener('change', closeOnDesktop);
        };
    }, [open]);

    return (
        <div className={styles.bar}>
            <button
                type="button"
                className={styles.toggle}
                aria-expanded={open}
                aria-controls="docs-menu"
                aria-label={open ? 'Close docs menu' : 'Open docs menu'}
                onClick={() => setOpen((current) => !current)}>
                <span className={styles.location}>
                    {location?.section ? (
                        <>
                            <span className={styles.section}>{location.section}</span>
                            <span className={styles.divider} aria-hidden>
                                /
                            </span>
                        </>
                    ) : null}
                    <span className={styles.page}>{location?.page ?? 'Docs'}</span>
                </span>
                <ChevronsUpDown className={styles.chevron} aria-hidden />
            </button>

            <div className={styles.menuLayer} data-open={open ? '' : undefined} inert={!open}>
                <div className={styles.scrim} aria-hidden onClick={() => setOpen(false)} />
                <div id="docs-menu" ref={menuRef} className={styles.menu}>
                    <DocsSidebarPanel tree={tree} className={styles.panel} />
                </div>
            </div>
        </div>
    );
}
