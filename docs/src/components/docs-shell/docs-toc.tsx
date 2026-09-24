'use client';

import { TOCItem, type TableOfContents } from 'fumadocs-core/toc';
import styles from './docs-toc.module.css';

export function DocsToc({ toc }: { toc: TableOfContents }) {
    if (toc.length === 0) return null;

    return (
        <nav className={styles.toc} aria-label="On this page">
            <p className={styles.title}>On this page</p>
            <ul className={styles.list}>
                {toc.map((item) => (
                    <li key={item.url}>
                        <TOCItem
                            href={item.url}
                            className={styles.item}
                            style={{ paddingLeft: `${10 + Math.max(0, item.depth - 2) * 12}px` }}>
                            {item.title}
                        </TOCItem>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
