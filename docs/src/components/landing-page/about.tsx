import type { ReactNode } from 'react';
import { Check, Minus, X } from 'lucide-react';
import KotlinLogo from '@/icons/Kotlin.svg';
import LogoMark from '@/icons/LogoMark.svg';
import SwiftLogo from '@/icons/Swift.svg';
import styles from './about.module.css';

interface VisualRow {
    icon: ReactNode;
    label: string;
    value: string;
    tone?: 'ink' | 'muted';
}

interface Story {
    label: string;
    headline: string;
    body: ReactNode;
    rows: VisualRow[];
}

const stories: Story[] = [
    {
        label: 'The problem',
        headline: 'Every API change meant editing the same shapes in several places.',
        body: (
            <>
                Sooner or later you miss one, and it drifts until something breaks in front of a user. On Swift one renamed field fails the
                whole decode, and a client that does not handle that failure crashes.
            </>
        ),
        rows: [
            {
                icon: <span className={styles.rowDot} />,
                label: 'Server',
                value: 'fullName: string',
            },
            {
                icon: <span className={styles.rowDot} />,
                label: 'Swift client',
                value: 'let name: String',
                tone: 'muted',
            },
            {
                icon: <X className={styles.rowIcon} />,
                label: 'Decode',
                value: 'keyNotFound("name")',
            },
        ],
    },
    {
        label: 'Where it started',
        headline: 'ts-rest solved the TypeScript half properly.',
        body: (
            <>
                Routes first, declared once, typed on both sides. The research and most of the syntax started with{' '}
                <a className={styles.link} href="https://ts-rest.com" target="_blank" rel="noreferrer">
                    ts-rest
                </a>
                , so if you know it you already know most of Kizuna.
            </>
        ),
        rows: [
            {
                icon: <Check className={styles.rowIcon} />,
                label: 'Server',
                value: 'typed',
            },
            {
                icon: <Check className={styles.rowIcon} />,
                label: 'TypeScript client',
                value: 'typed',
            },
            {
                icon: <Minus className={styles.rowIcon} />,
                label: 'Swift and Kotlin',
                value: 'written by hand',
                tone: 'muted',
            },
        ],
    },
    {
        label: 'What Kizuna.js adds',
        headline: 'Swift and Kotlin clients generated from the same routes.',
        body: (
            <>
                ts-rest stopped at the edge of TypeScript. A route deprecated once in TypeScript arrives deprecated in Xcode and in Android
                Studio.
            </>
        ),
        rows: [
            {
                icon: <SwiftLogo className={styles.rowIcon} />,
                label: 'Xcode',
                value: '@available',
            },
            {
                icon: <KotlinLogo className={styles.rowIcon} />,
                label: 'Android Studio',
                value: '@Deprecated',
            },
        ],
    },
];

export function About() {
    return (
        <div className={styles.stories}>
            {stories.map((story) => (
                <article key={story.label} className={styles.card}>
                    <ul className={styles.visual}>
                        {story.rows.map((row) => (
                            <li key={row.label} className={styles.row} data-tone={row.tone ?? 'ink'}>
                                <span className={styles.rowLead}>{row.icon}</span>
                                <span className={styles.rowLabel}>{row.label}</span>
                                <code className={styles.rowValue}>{row.value}</code>
                            </li>
                        ))}
                    </ul>
                    <p className={styles.label}>{story.label}</p>
                    <h2 className={styles.headline}>{story.headline}</h2>
                    <p className={styles.body}>{story.body}</p>
                </article>
            ))}
        </div>
    );
}

export function AboutName() {
    return (
        <article className={styles.nameCard}>
            <span className={styles.glyph} aria-hidden>
                <LogoMark />
            </span>
            <div>
                <p className={styles.label}>The name</p>
                <h2 className={styles.headline}>絆 (kizuna) is the Japanese word for a lasting bond between people.</h2>
                <p className={styles.body}>
                    We deeply admire Japan, and 絆 is one of its most beautiful words. It is strongest between people who stand by each
                    other through hard times. We chose it for a smaller bond. Every app trusts its API to hold, and Kizuna.js exists to make
                    sure it does.
                </p>
            </div>
        </article>
    );
}
