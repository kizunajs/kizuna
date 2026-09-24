'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import styles from './install-command.module.css';

const COMMAND = 'npm install kizunajs@beta';

export function InstallCommand({ className }: { className?: string }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const handle = window.setTimeout(() => setCopied(false), 1600);
        return () => window.clearTimeout(handle);
    }, [copied]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(COMMAND);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className={clsx(styles.command, className)}>
            <span className={styles.prompt} aria-hidden>
                $
            </span>
            <code className={styles.text}>{COMMAND}</code>
            <button type="button" className={styles.copy} onClick={copy} aria-label={copied ? 'Copied' : 'Copy install command'}>
                {copied ? <Check className={styles.icon} aria-hidden /> : <Copy className={styles.icon} aria-hidden />}
            </button>
        </div>
    );
}
