import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { BadgeCheck, Bot, Braces, Check, FileJson, FileText, GitCompare, History, Layers, Minus, Smartphone, X, Zap } from 'lucide-react';
import panel from './panel.module.css';
import styles from './comparison.module.css';

type Support = 'yes' | 'partly' | 'no';

interface Mark {
    support: Support;
    note?: string;
    href?: string;
}

interface Row {
    label: string;
    marks: [Mark, Mark, Mark, Mark, Mark];
}

const libraries = ['Kizuna.js', 'ts-rest', 'tRPC', 'oRPC', 'Hono'];

const yes: Mark = {
    support: 'yes',
};

const no: Mark = {
    support: 'no',
};

const rows: Row[] = [
    {
        label: 'REST routes',
        marks: [
            yes,
            yes,
            {
                support: 'no',
                note: 'Procedures',
            },
            {
                support: 'partly',
                note: 'Through OpenAPI',
            },
            yes,
        ],
    },
    {
        label: 'OpenAPI 3.1',
        marks: [
            yes,
            {
                support: 'partly',
                note: '3.0 add-on',
            },
            {
                support: 'partly',
                note: 'Alpha add-on',
            },
            yes,
            {
                support: 'partly',
                note: 'Separate route API',
            },
        ],
    },
    {
        label: 'TanStack Query',
        marks: [
            {
                support: 'yes',
                note: 'React, Vue, Svelte',
            },
            {
                support: 'yes',
                note: 'React, Vue, Solid',
            },
            {
                support: 'partly',
                note: 'React',
            },
            {
                support: 'yes',
                note: 'React, Vue, Solid, Svelte, Angular',
            },
            no,
        ],
    },
    {
        label: 'Swift client',
        marks: [yes, no, no, no, no],
    },
    {
        label: 'Kotlin client',
        marks: [yes, no, no, no, no],
    },
    {
        label: 'MCP tools from routes',
        marks: [
            yes,
            no,
            no,
            {
                support: 'no',
                note: 'AI SDK tools instead',
            },
            {
                support: 'no',
                note: 'MCP transport only',
            },
        ],
    },
    {
        label: 'Standard Schema',
        marks: [
            {
                support: 'no',
                note: 'Zod 4, read why',
                href: '/docs/zod',
            },
            {
                support: 'partly',
                note: 'Prerelease',
            },
            yes,
            yes,
            yes,
        ],
    },
    {
        label: 'Maintained',
        marks: [
            yes,
            {
                support: 'partly',
                note: 'No stable release since March 2025',
            },
            yes,
            yes,
            yes,
        ],
    },
];

const icons = {
    yes: Check,
    partly: Minus,
    no: X,
};

const labels = {
    yes: 'Yes',
    partly: 'Partly',
    no: 'No',
};

export function ComparisonTable() {
    return (
        <div className={panel.panel}>
            <div className={styles.window}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th scope="col">
                                <span className={styles.srOnly}>Feature</span>
                            </th>
                            {libraries.map((library) => (
                                <th key={library} scope="col" className={styles.library}>
                                    {library}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.label}>
                                <th scope="row" className={styles.feature}>
                                    {row.label}
                                </th>
                                {row.marks.map((mark, index) => {
                                    const Icon = icons[mark.support];
                                    return (
                                        <td key={libraries[index]} className={styles.mark} data-support={mark.support}>
                                            <Icon className={styles.icon} aria-label={labels[mark.support]} />
                                            {mark.note && mark.href ? (
                                                <Link href={mark.href} className={styles.note}>
                                                    {mark.note}
                                                </Link>
                                            ) : mark.note ? (
                                                <span className={styles.note}>{mark.note}</span>
                                            ) : null}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className={panel.body}>
                <p className={panel.title}>Every library here gives you a typed TypeScript client</p>
                <p className={panel.text}>
                    What sets them apart is what else you get from the same routes. Checked against each project&apos;s own docs in
                    September 2026.
                </p>
            </div>
        </div>
    );
}

interface Fit {
    icon: LucideIcon;
    text: string;
    libraries?: string[];
}

const kizunaFits: Fit[] = [
    {
        icon: Smartphone,
        text: 'Swift or Kotlin apps call your API',
        libraries: ['Kizuna.js'],
    },
    {
        icon: Bot,
        text: 'AI assistants call your routes as tools',
        libraries: ['Kizuna.js'],
    },
    {
        icon: History,
        text: 'A deprecated route should warn in Xcode and Android Studio',
        libraries: ['Kizuna.js'],
    },
    {
        icon: FileJson,
        text: 'You want OpenAPI 3.1 straight from your REST routes',
        libraries: ['Kizuna.js'],
    },
    {
        icon: GitCompare,
        text: 'A breaking change should be caught before it ships',
        libraries: ['Kizuna.js'],
    },
];

const otherFits: Fit[] = [
    {
        icon: Braces,
        text: 'You would rather call functions than design HTTP routes',
        libraries: ['tRPC', 'oRPC'],
    },
    {
        icon: Layers,
        text: 'You need Standard Schema validation',
        libraries: ['tRPC', 'oRPC', 'Hono'],
    },
    {
        icon: Zap,
        text: 'You need a typed client with no generate step',
        libraries: ['tRPC', 'oRPC', 'Hono'],
    },
    {
        icon: BadgeCheck,
        text: 'You need a stable release before Kizuna.js 2.0 leaves beta',
        libraries: ['tRPC', 'oRPC', 'Hono'],
    },
    {
        icon: FileText,
        text: 'You want the contract in its own package, apart from the handlers',
        libraries: ['oRPC'],
    },
];

function FitList({ fits }: { fits: Fit[] }) {
    return (
        <ul className={styles.fits}>
            {fits.map((fit) => (
                <li key={fit.text} className={styles.fit}>
                    <fit.icon className={styles.fitIcon} aria-hidden />
                    <span className={styles.fitText}>{fit.text}</span>
                    {fit.libraries?.map((library) => (
                        <code key={library} className={styles.fitLibrary}>
                            {library}
                        </code>
                    ))}
                </li>
            ))}
        </ul>
    );
}

export function WhichFits() {
    return (
        <div className={styles.fitPanels}>
            <div className={panel.panel}>
                <div className={styles.window}>
                    <FitList fits={kizunaFits} />
                </div>
                <div className={panel.body}>
                    <p className={panel.title}>Pick Kizuna.js</p>
                    <p className={panel.text}>Every client, document and tool comes from the same routes.</p>
                </div>
            </div>
            <div className={panel.panel}>
                <div className={styles.window}>
                    <FitList fits={otherFits} />
                </div>
                <div className={panel.body}>
                    <p className={panel.title}>Pick another library</p>
                    <p className={panel.text}>Each one is a good choice for the job it was built for.</p>
                </div>
            </div>
        </div>
    );
}
