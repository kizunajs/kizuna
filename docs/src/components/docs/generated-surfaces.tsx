import { FileText, Terminal } from 'lucide-react';
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
        icon: FileText,
        title: 'OpenAPI 3.1',
        detail: 'Paths, schemas and security',
        href: '/docs/openapi',
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
        detail: 'URLSession and Codable types',
        href: '/docs/clients/swift',
    },
    {
        icon: KotlinLogo,
        title: 'Kotlin',
        detail: 'OkHttp and kotlinx.serialization',
        href: '/docs/clients/kotlin',
    },
    {
        icon: McpLogo,
        title: 'MCP tools',
        detail: 'Tools an assistant can call',
        href: '/docs/mcp',
    },
];

export function GeneratedSurfaces() {
    return (
        <div className="not-prose my-8 flex flex-col items-center gap-0">
            <div className="w-full max-w-md rounded-xl border bg-fd-card px-4 py-3 text-center">
                <div className="font-mono text-sm font-semibold text-fd-foreground">kizuna.config.ts</div>
                <div className="mt-0.5 text-xs text-fd-muted-foreground">Your adapter, routes, identities, jobs and plugins</div>
            </div>

            <div aria-hidden className="h-5 w-px bg-fd-border" />

            <div className="inline-flex items-center gap-2 rounded-lg border bg-fd-card px-3 py-1.5">
                <Terminal className="size-3.5 text-fd-muted-foreground" />
                <span className="font-mono text-sm font-medium text-fd-foreground">kizuna generate</span>
            </div>

            <div aria-hidden className="h-5 w-px bg-fd-border" />

            <div aria-hidden className="relative hidden h-5 w-full lg:block">
                <div className="absolute top-0 right-[calc((100%-3rem)/10)] left-[calc((100%-3rem)/10)] h-px bg-fd-border" />
                <div className="grid h-full grid-cols-5 gap-x-3">
                    {SURFACES.map(({ title }) => (
                        <div key={title} className="flex justify-center">
                            <div className="h-full w-px bg-fd-border" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-x-3 gap-y-3 pt-3 sm:grid-cols-3 lg:grid-cols-5 lg:pt-0">
                {SURFACES.map(({ icon: Icon, title, detail, href }) => (
                    <a
                        key={title}
                        href={href}
                        className="flex flex-col items-center gap-1.5 rounded-xl border bg-fd-card px-3 py-4 text-center no-underline transition-colors hover:border-fd-primary/40">
                        <Icon className="size-[22px] text-fd-foreground" />
                        <span className="text-sm font-semibold text-fd-foreground">{title}</span>
                        <span className="text-xs leading-snug text-fd-muted-foreground">{detail}</span>
                    </a>
                ))}
            </div>
        </div>
    );
}
