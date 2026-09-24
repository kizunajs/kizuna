'use client';

import clsx from 'clsx';
import type { ShikiTransformer } from 'shiki';
import Link from 'next/link';
import { ArrowRight, FileCode } from 'lucide-react';
import { CodeWindow } from '@/components/code/code-window';
import { Section } from './section';
import panel from './panel.module.css';
import styles from './breaking-changes.module.css';
import { DocsLink } from '@/components/landing-page/docs-link';

type Severity = 'breaking' | 'changed' | 'added';

interface OutputEntry {
    severity: Severity;
    text: string;
}

const output: OutputEntry[] = [
    {
        severity: 'breaking',
        text: 'GET /users/:id 200.email removed',
    },
    {
        severity: 'breaking',
        text: 'POST /users body.organisationId is now required',
    },
    {
        severity: 'changed',
        text: 'GET /users/:id can now answer 410',
    },
    {
        severity: 'added',
        text: 'POST /users/:id/archive added',
    },
];

const severityLabels: Record<Severity, string> = {
    breaking: 'BREAKING',
    changed: 'CHANGED',
    added: 'ADDED',
};

const summary = (Object.keys(severityLabels) as Severity[])
    .map((severity) => `${output.filter((entry) => entry.severity === severity).length} ${severity}`)
    .join(', ');

const ROUTE_CODE = `getUser: k
  .route({
    method: 'GET',
    path: '/users/:id',
    responses: {
      200: z.object({
        id: z.string(),
        email_address: z.email(),
      }),
      404: ProblemDetailsSchema,
    },
  })`;

const FLAGGED_LINE = 8;

const flagLine: ShikiTransformer = {
    line(node, lineNumber) {
        if (lineNumber === FLAGGED_LINE) this.addClassToHast(node, 'kizuna-line-flagged');
    },
};

const severityStyles = {
    breaking: styles.breaking,
    changed: styles.changed,
    added: styles.added,
};

export function BreakingChanges() {
    return (
        <Section
            aside={<DocsLink href="/docs/breaking-changes" />}
            title="Catch breaking changes before your users do"
            description="Kizuna compares every change against main and fails the pull request on anything that would break an app already in the App Store.">
            <div className={clsx(panel.panel, styles.root)}>
                <div className={styles.windows} aria-hidden>
                    <div className={styles.terminal}>
                        <div className={styles.terminalBar}>
                            <span className={styles.terminalDot} />
                            <span className={styles.terminalDot} />
                            <span className={styles.terminalDot} />
                            <span className={styles.terminalTitle}>Terminal</span>
                        </div>
                        <div className={styles.terminalBody}>
                            <p className={styles.command}>
                                <span className={styles.prompt}>$</span> kizuna diff --against main
                            </p>
                            <ul className={styles.entries}>
                                {output.map((entry) => (
                                    <li key={entry.text} className={styles.entry}>
                                        <span className={clsx(styles.label, severityStyles[entry.severity])}>
                                            {severityLabels[entry.severity]}
                                        </span>
                                        <span className={styles.entryText}>{entry.text}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className={styles.summary}>
                                {summary}
                                <br />
                                exit 1
                            </p>
                        </div>
                    </div>

                    <div className={styles.editor}>
                        <CodeWindow
                            lang="ts"
                            code={ROUTE_CODE}
                            title="src/routes/users.ts"
                            icon={<FileCode className={styles.fileIcon} />}
                            dots
                            options={{
                                themes: {
                                    light: 'github-light',
                                    dark: 'github-dark',
                                },
                                transformers: [flagLine],
                            }}
                        />
                    </div>
                </div>

                <div className={styles.outcomes}>
                    <div className={panel.body}>
                        <Link href="/docs/deprecations" className={panel.title}>
                            Deprecate it
                            <ArrowRight className={panel.arrow} aria-hidden />
                        </Link>
                        <p className={panel.text}>
                            Serve <code className={styles.inlineCode}>email</code> and{' '}
                            <code className={styles.inlineCode}>email_address</code> together until the sunset date you set. Nothing on the
                            old name breaks.
                        </p>
                    </div>
                    <div className={panel.body}>
                        <Link href="/docs/breaking-changes" className={panel.title}>
                            Break it on purpose
                            <ArrowRight className={panel.arrow} aria-hidden />
                        </Link>
                        <p className={panel.text}>
                            Label the pull request <code className={styles.inlineCode}>breaking changes</code>. CI stays red until someone
                            signs off on it.
                        </p>
                    </div>
                </div>
            </div>
        </Section>
    );
}
