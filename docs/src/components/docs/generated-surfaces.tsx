import { FileText, Globe } from 'lucide-react';
import type { ComponentType } from 'react';
import KotlinLogo from '@/icons/Kotlin.svg';
import McpLogo from '@/icons/Mcp.svg';
import SwiftLogo from '@/icons/Swift.svg';
import TypeScriptLogo from '@/icons/TypeScript.svg';

interface Surface {
    icon: ComponentType<{ className?: string }>;
    title: string;
    detail: string;
    href: string;
}

const SURFACES: Surface[] = [
    {
        icon: Globe,
        title: 'REST routes',
        detail: 'Validated and guarded',
        href: '/docs/routes',
    },
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
        <div className="not-prose mt-2 mb-8 flex flex-col items-center">
            <div className="w-full max-w-md rounded-xl border bg-fd-card px-4 py-3 text-center">
                <div className="font-mono text-sm font-semibold text-fd-foreground">kizuna.config.ts</div>
                <div className="mt-1 text-sm text-fd-muted-foreground">Your adapter, routes, identities, jobs and plugins</div>
            </div>

            <div aria-hidden className="hidden h-6 w-px bg-fd-border lg:block" />

            <div aria-hidden className="relative hidden h-5 w-full lg:block">
                <div className="absolute top-0 right-[calc((100%-3.75rem)/12)] left-[calc((100%-3.75rem)/12)] h-px bg-fd-border" />
                <div className="grid h-full grid-cols-6 gap-x-3">
                    {SURFACES.map(({ title }) => (
                        <div key={title} className="flex justify-center">
                            <div className="h-full w-px bg-fd-border" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-3 pt-3 sm:grid-cols-3 lg:grid-cols-6 lg:pt-0">
                {SURFACES.map(({ icon: Icon, title, detail, href }) => (
                    <a
                        key={title}
                        href={href}
                        className="flex flex-col items-center gap-1.5 rounded-xl border bg-fd-card px-3 py-4 text-center no-underline transition-colors hover:bg-fd-accent/80">
                        <Icon className="size-[22px] text-fd-foreground" />
                        <span className="text-sm font-semibold text-fd-foreground">{title}</span>
                        <span className="text-[13px] leading-snug text-fd-muted-foreground">{detail}</span>
                    </a>
                ))}
            </div>
        </div>
    );
}
