import clsx from 'clsx';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { ComponentType } from 'react';
import KotlinLogo from '@/icons/Kotlin.svg';
import McpLogo from '@/icons/Mcp.svg';
import SwiftLogo from '@/icons/Swift.svg';
import TypeScriptLogo from '@/icons/TypeScript.svg';
import styles from './generated-surfaces.module.css';

interface Surface {
    icon: ComponentType<{ className?: string }>;
    title: string;
    detail: string;
    href: string;
}

const SURFACES: Surface[] = [
    {
        icon: FileText,
        title: 'OpenAPI 3.1',
        detail: 'Document and reference UI',
        href: '/docs/openapi',
    },
    {
        icon: McpLogo,
        title: 'MCP tools',
        detail: 'Routes a model can call',
        href: '/docs/mcp',
    },
    {
        icon: TypeScriptLogo,
        title: 'TypeScript',
        detail: 'fetch and TanStack Query',
        href: '/docs/clients/fetch',
    },
    {
        icon: SwiftLogo,
        title: 'Swift',
        detail: 'URLSession and Codable',
        href: '/docs/clients/swift',
    },
    {
        icon: KotlinLogo,
        title: 'Kotlin',
        detail: 'OkHttp and kotlinx',
        href: '/docs/clients/kotlin',
    },
];

export function GeneratedSurfaces() {
    return (
        <div className={clsx('not-prose', styles.root)}>
            <div className={styles.source}>
                <span className={styles.sourceName}>kizuna.config.ts</span>
                <span className={styles.sourceText}>Your adapter, routes, identities, jobs and plugins</span>
            </div>

            <div className={styles.join} aria-hidden>
                <span className={styles.joinDrop} />
                <span className={styles.joinRail} />
            </div>

            <div className={styles.grid}>
                {SURFACES.map(({ icon: Icon, title, detail, href }) => (
                    <Link key={title} href={href} className={styles.card}>
                        <span className={styles.stub} aria-hidden />
                        <Icon className={styles.icon} />
                        <span className={styles.title}>{title}</span>
                        <span className={styles.detail}>{detail}</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
