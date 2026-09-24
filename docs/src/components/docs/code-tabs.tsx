'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import blockStyles from './code-block.module.css';
import styles from './code-tabs.module.css';

interface CodeTab {
    id: string;
    label: string;
    code: ReactNode;
    copy: string;
}

const CHANGE_EVENT = 'kizuna-code-tab';

function readStored(group: string) {
    try {
        return window.localStorage.getItem(`kizuna-tab:${group}`);
    } catch {
        return null;
    }
}

function storeChoice(group: string, id: string) {
    try {
        window.localStorage.setItem(`kizuna-tab:${group}`, id);
    } catch {
        // Storage can be blocked, and the choice still applies to this page.
    }
    window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, {
            detail: {
                group,
                id,
            },
        })
    );
}

/**
 * A code window whose header switches between versions of one snippet. Every
 * window sharing a `group` follows the same choice, and the choice is remembered.
 */
export function CodeTabs({ group, tabs }: { group: string; tabs: CodeTab[] }) {
    const [activeId, setActiveId] = useState(tabs[0].id);
    const [copied, setCopied] = useState(false);
    const timer = useRef<number>(undefined);

    useEffect(() => {
        const stored = readStored(group);
        if (stored && tabs.some((tab) => tab.id === stored)) setActiveId(stored);

        const follow = (event: Event) => {
            const { detail } = event as CustomEvent<{ group: string; id: string }>;
            if (detail.group === group && tabs.some((tab) => tab.id === detail.id)) setActiveId(detail.id);
        };
        window.addEventListener(CHANGE_EVENT, follow);
        return () => window.removeEventListener(CHANGE_EVENT, follow);
    }, [group, tabs]);

    const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

    function copy() {
        void navigator.clipboard.writeText(active.copy);
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1500);
    }

    return (
        <figure className={clsx('not-prose', blockStyles.block)}>
            <div className={clsx(blockStyles.header, styles.header)}>
                <div className={styles.tabs} role="tablist">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={tab.id === active.id}
                            className={clsx(styles.tab, tab.id === active.id && styles.tabActive)}
                            onClick={() => storeChoice(group, tab.id)}>
                            {tab.label}
                        </button>
                    ))}
                </div>
                <button type="button" className={blockStyles.copy} onClick={copy} aria-label={copied ? 'Copied' : 'Copy code'}>
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                </button>
            </div>
            <div className={clsx(blockStyles.viewport, styles.viewport)} role="tabpanel">
                <pre className={styles.pre}>
                    <code>{active.code}</code>
                </pre>
            </div>
        </figure>
    );
}
