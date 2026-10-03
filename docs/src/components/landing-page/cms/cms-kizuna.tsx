import Link from 'next/link';
import type { ComponentType } from 'react';
import { ArrowRight, Clock, FileText, KeyRound, Mail, Route } from 'lucide-react';
import { CodeWindow } from '@/components/code/code-window';
import KotlinLogo from '@/icons/Kotlin.svg';
import McpLogo from '@/icons/Mcp.svg';
import SwiftLogo from '@/icons/Swift.svg';
import TanstackLogo from '@/icons/TanStack.svg';
import TsLogo from '@/icons/TypeScript.svg';
import { Section } from '../section';
import panel from '../panel.module.css';
import styles from './cms-kizuna.module.css';

interface Extra {
    icons: ComponentType<{ className?: string }>[];
    title: string;
    text: string;
    href: string;
}

const left: Extra[] = [
    {
        icons: [Route],
        title: 'Routes of your own',
        text: 'A contact form or a webhook, beside the content.',
        href: '/docs/routes',
    },
    {
        icons: [Clock],
        title: 'Scheduled jobs',
        text: 'Send a weekly digest of new articles.',
        href: '/docs/jobs',
    },
    {
        icons: [Mail],
        title: 'Plugins',
        text: 'Email through Resend, from any handler.',
        href: '/docs/resend',
    },
    {
        icons: [KeyRound],
        title: 'Authentication',
        text: 'Identities, roles and guards on every route.',
        href: '/docs/authentication',
    },
];

const right: Extra[] = [
    {
        icons: [McpLogo],
        title: 'MCP tools',
        text: 'Your own routes become tools beside the CMS’s.',
        href: '/docs/mcp',
    },
    {
        icons: [SwiftLogo, KotlinLogo],
        title: 'Swift and Kotlin clients',
        text: 'Read the same content in iOS and Android apps.',
        href: '/docs/clients/swift',
    },
    {
        icons: [TsLogo, TanstackLogo],
        title: 'Fetch and TanStack Query',
        text: 'Typed clients for your own front end.',
        href: '/docs/clients/fetch',
    },
    {
        icons: [FileText],
        title: 'OpenAPI',
        text: 'A spec for every route, content included.',
        href: '/docs/openapi',
    },
];

const configCode = `export default defineConfig({
    adapter: nextAdapter(),
    content: cms({
        db,
        pages,
    }),
    routes,
    jobs,
    jobRunner: {
        mode: 'http',
    },
    plugins: [
        mcpPlugin({
            name: 'Example',
        }),
        resendPlugin(resend),
    ],
});`;

const more: {
    label: string;
    href: string;
}[] = [
    {
        label: 'Streaming',
        href: '/docs/streaming',
    },
    {
        label: 'Caching',
        href: '/docs/caching',
    },
    {
        label: 'OAuth 2.1',
        href: '/docs/oauth',
    },
    {
        label: 'Deprecations',
        href: '/docs/deprecations',
    },
    {
        label: 'Breaking-change checks',
        href: '/docs/breaking-changes',
    },
    {
        label: 'ESLint rules',
        href: '/docs/eslint',
    },
    {
        label: 'Express, Fastify and Hono',
        href: '/docs/adapters/express',
    },
    {
        label: 'RFC 9457 errors',
        href: '/docs/standards',
    },
];

function Cards({ extras, side }: { extras: Extra[]; side: 'left' | 'right' }) {
    return (
        <ul className={styles.cards} data-side={side}>
            {extras.map((extra) => (
                <li key={extra.title} className={styles.card}>
                    <Link href={extra.href} className={styles.link}>
                        <span className={styles.icons}>
                            {extra.icons.map((ExtraIcon, index) => (
                                <ExtraIcon key={index} className={styles.icon} />
                            ))}
                        </span>
                        <span className={styles.body}>
                            <span className={styles.title}>
                                {extra.title}
                                <ArrowRight className={styles.arrow} aria-hidden />
                            </span>
                            <span className={styles.text}>{extra.text}</span>
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

export function CmsKizuna() {
    return (
        <Section
            align="center"
            title="Your CMS, with all of Kizuna"
            description="The CMS lives in a Kizuna config, so routes, jobs, plugins and typed clients are a line away.">
            <div className={styles.layout}>
                <Cards extras={left} side="left" />
                <div className={panel.panel}>
                    <CodeWindow lang="ts" code={configCode} title="kizuna.config.ts" dots />
                </div>
                <Cards extras={right} side="right" />
            </div>
            <div className={styles.more}>
                <span className={styles.moreLabel}>And more</span>
                {more.map((item) => (
                    <Link key={item.label} href={item.href} className={styles.chip}>
                        {item.label}
                    </Link>
                ))}
            </div>
        </Section>
    );
}
