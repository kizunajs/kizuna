'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUp, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import buttonStyles from '@/components/ui/button.module.css';
import { DocsLink } from '@/components/landing-page/docs-link';
import { Section } from './section';
import panel from './panel.module.css';
import styles from './assistant.module.css';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

const SUMMARY =
    'This week brought 42 tickets, down 12 from last week. Most were about password resets, and two customers asked for invoices in euros.';

const SUMMARY_WORDS = SUMMARY.split(' ');

const SIGNUPS = [
    {
        day: 'M',
        signups: 38,
    },
    {
        day: 'T',
        signups: 52,
    },
    {
        day: 'W',
        signups: 47,
    },
    {
        day: 'T',
        signups: 71,
    },
    {
        day: 'F',
        signups: 64,
    },
    {
        day: 'S',
        signups: 29,
    },
    {
        day: 'S',
        signups: 33,
    },
];

const MOST_SIGNUPS = Math.max(...SIGNUPS.map((entry) => entry.signups));

function useStreamedWords() {
    const reduced = usePrefersReducedMotion();
    const [count, setCount] = useState(SUMMARY_WORDS.length);

    useEffect(() => {
        if (reduced) {
            setCount(SUMMARY_WORDS.length);
            return;
        }
        let shown = 0;
        const timer = window.setInterval(() => {
            shown = shown >= SUMMARY_WORDS.length + 12 ? 0 : shown + 1;
            setCount(Math.min(shown, SUMMARY_WORDS.length));
        }, 110);
        return () => window.clearInterval(timer);
    }, [reduced]);

    return count;
}

function Prompt({ children }: { children: ReactNode }) {
    return <p className={styles.prompt}>{children}</p>;
}

function ToolStatus({ children }: { children: ReactNode }) {
    return (
        <p className={styles.status}>
            {children}
            <ChevronRight className={styles.statusIcon} aria-hidden />
        </p>
    );
}

function StreamingChat() {
    const count = useStreamedWords();

    return (
        <div className={styles.chat}>
            <Prompt>Summarise this week’s support tickets</Prompt>
            <p className={styles.reply}>
                {SUMMARY_WORDS.slice(0, count).join(' ')}
                {count < SUMMARY_WORDS.length ? <span className={styles.caret} aria-hidden /> : null}
            </p>
        </div>
    );
}

function ToolsChat() {
    return (
        <div className={styles.chat}>
            <Prompt>How did signups do this week?</Prompt>
            <ToolStatus>Plotted signups</ToolStatus>
            <div className={styles.chartCard}>
                <div className={styles.chartHead}>
                    <span className={styles.chartTotal}>334</span>
                    <span className={styles.chartChange}>signups, up 18%</span>
                </div>
                <div className={styles.chart} aria-hidden>
                    {SIGNUPS.map((entry) => (
                        <span key={entry.signups} className={styles.bar}>
                            <span
                                className={clsx(styles.barFill, entry.signups === MOST_SIGNUPS && styles.barFillPeak)}
                                style={{
                                    height: `${(entry.signups / MOST_SIGNUPS) * 100}%`,
                                }}
                            />
                            <span className={styles.barDay}>{entry.day}</span>
                        </span>
                    ))}
                </div>
            </div>
            <p className={styles.reply}>Thursday was the best day, right after the launch email.</p>
        </div>
    );
}

function ApprovalChat() {
    return (
        <div className={styles.chat}>
            <Prompt>Refund Ada’s last order, it arrived broken</Prompt>
            <ToolStatus>Found order #1042</ToolStatus>
            <p className={styles.reply}>Order #1042 arrived broken on Tuesday. I can refund the full €49.00.</p>
        </div>
    );
}

function ApprovalQuestion() {
    return (
        <div className={styles.dock}>
            <span className={styles.dockTitle}>Refund €49.00 to Ada Lovelace?</span>
            <span className={styles.actions}>
                <span
                    className={clsx(
                        buttonStyles.button,
                        buttonStyles.small,
                        buttonStyles.secondary,
                        styles.button,
                        styles.buttonSecondary
                    )}>
                    No
                </span>
                <span className={clsx(buttonStyles.button, buttonStyles.small, buttonStyles.primary, styles.button, styles.buttonPrimary)}>
                    Yes
                </span>
            </span>
        </div>
    );
}

interface Example {
    title: string;
    href: string;
    text: ReactNode;
    chat: ReactNode;
    question?: ReactNode;
}

const EXAMPLES: Example[] = [
    {
        title: 'Streaming',
        href: '/docs/streaming',
        text: 'Replies arrive word by word as typed events, in TypeScript, Swift and Kotlin.',
        chat: <StreamingChat />,
    },
    {
        title: 'Tools',
        href: '/docs/tools#running-the-calls',
        text: 'The model calls your routes as the signed-in person, and your app renders each result.',
        chat: <ToolsChat />,
    },
    {
        title: 'Approval',
        href: '/docs/tools#wait-for-approval',
        text: (
            <>
                A route marked <code className={styles.code}>needsApproval</code> waits for the person to say yes before it runs.
            </>
        ),
        chat: <ApprovalChat />,
        question: <ApprovalQuestion />,
    },
];

export function Assistant() {
    return (
        <Section
            aside={<DocsLink href="/docs/tools" />}
            title="Build AI assistants on your API"
            description="Stream a reply, let the model call your API, and ask before it acts, all built from the routes you already have.">
            <div className={styles.panels}>
                {EXAMPLES.map((example) => (
                    <article key={example.title} className={panel.panel}>
                        <div className={styles.visual}>
                            {example.chat}
                            <div className={styles.composer}>
                                {example.question}
                                <div className={styles.composerRow}>
                                    <span className={styles.composerPlaceholder}>Ask anything</span>
                                    <span className={styles.composerSend}>
                                        <ArrowUp className={styles.composerIcon} aria-hidden />
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className={clsx(panel.body, styles.body)}>
                            <Link href={example.href} className={panel.title}>
                                {example.title}
                                <ArrowRight className={panel.arrow} aria-hidden />
                            </Link>
                            <p className={panel.text}>{example.text}</p>
                        </div>
                    </article>
                ))}
            </div>
        </Section>
    );
}
