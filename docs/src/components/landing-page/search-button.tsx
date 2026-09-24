'use client';

import { useEffect } from 'react';
import { Search } from 'lucide-react';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import styles from './search-button.module.css';

/**
 * `/api/search` builds its index on the first request, and the dialog shows "No
 * results" until it is ready. A request on idle builds it before anyone types.
 */
let warmed = false;

function warmSearchIndex() {
    if (warmed) return;
    warmed = true;

    void fetch('/api/search?query=kizuna').catch(() => {
        warmed = false;
    });
}

export function SearchButton() {
    const { enabled, hotKey, setOpenSearch } = useSearchContext();

    useEffect(() => {
        if (!enabled) return;

        if (typeof window.requestIdleCallback === 'function') {
            const handle = window.requestIdleCallback(warmSearchIndex);
            return () => window.cancelIdleCallback(handle);
        }

        const handle = window.setTimeout(warmSearchIndex, 1000);
        return () => window.clearTimeout(handle);
    }, [enabled]);

    if (!enabled) return null;

    return (
        <button type="button" className={styles.button} onClick={() => setOpenSearch(true)}>
            <Search className={styles.icon} aria-hidden />
            Search docs
            <kbd className={styles.hotKey}>
                {hotKey.map((key, index) => (
                    <span key={index}>{key.display}</span>
                ))}
            </kbd>
        </button>
    );
}
