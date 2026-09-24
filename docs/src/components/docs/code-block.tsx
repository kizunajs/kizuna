'use client';

import clsx from 'clsx';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import styles from './code-block.module.css';

interface CodeBlockProps extends ComponentProps<'pre'> {
    title?: string;
    icon?: ReactNode | string;
}

function CopyButton({ source }: { source: React.RefObject<HTMLDivElement | null> }) {
    const [copied, setCopied] = useState(false);

    function copy() {
        const pre = source.current?.querySelector('pre');
        if (!pre) return;
        const clone = pre.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.nd-copy-ignore').forEach((node) => node.replaceWith('\n'));
        void navigator.clipboard.writeText(clone.textContent ?? '');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    }

    return (
        <button type="button" className={styles.copy} onClick={copy} aria-label={copied ? 'Copied' : 'Copy code'}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </button>
    );
}

export function CodeBlock({ title, icon, className, style, children, ...props }: CodeBlockProps) {
    const viewport = useRef<HTMLDivElement>(null);
    const lineNumbers = (props as Record<string, unknown>)['data-line-numbers'];

    return (
        <figure
            dir="ltr"
            className={clsx('shiki not-prose', styles.block, className)}
            data-line-numbers={lineNumbers ? '' : undefined}
            style={style}>
            {title ? (
                <div className={styles.header}>
                    {typeof icon === 'string' ? (
                        <span className={styles.icon} dangerouslySetInnerHTML={{ __html: icon }} />
                    ) : icon ? (
                        <span className={styles.icon}>{icon}</span>
                    ) : null}
                    <figcaption className={styles.title}>{title}</figcaption>
                    <CopyButton source={viewport} />
                </div>
            ) : (
                <div className={styles.floatingCopy}>
                    <CopyButton source={viewport} />
                </div>
            )}
            <div
                ref={viewport}
                className={clsx(styles.viewport, !title && styles.viewportUntitled)}
                tabIndex={0}
                role="region"
                aria-label={title ?? 'Code'}>
                <pre {...props}>{children}</pre>
            </div>
        </figure>
    );
}
