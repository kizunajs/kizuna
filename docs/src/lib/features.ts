import { Clock, FileText, KeyRound, Layers, Plug, Puzzle, Radio, Section, Timer, TriangleAlert, Wrench, Zap } from 'lucide-react';
import KotlinLogo from '@/icons/Kotlin.svg';
import McpLogo from '@/icons/Mcp.svg';
import SwiftLogo from '@/icons/Swift.svg';
import TanstackLogo from '@/icons/TanStack.svg';
import type { ComponentType } from 'react';

type FeatureIcon = ComponentType<{ className?: string }>;

export interface Feature {
    icons: FeatureIcon[];
    title: string;
    href: string;
    /**
     * Plain-text summary. Kept free of markup so the same string renders in
     * both the landing cards and the docs bullet list.
     */
    description: string;
}

export const features: Feature[] = [
    {
        icons: [FileText],
        title: 'OpenAPI generation',
        href: '/docs/openapi',
        description: 'Generate a complete OpenAPI spec from the contract you already wrote.',
    },
    {
        icons: [SwiftLogo, KotlinLogo],
        title: 'Native client generation',
        href: '/docs/clients/swift',
        description: 'Typed API clients for Swift (iOS/macOS) and Kotlin (Android/JVM).',
    },
    {
        icons: [McpLogo],
        title: 'MCP server generation',
        href: '/docs/mcp',
        description: 'Expose your API as MCP tools so AI assistants can call your endpoints.',
    },
    {
        icons: [TanstackLogo],
        title: 'TanStack Query',
        href: '/docs/clients/tanstack-query',
        description: 'Typed query and mutation options with caching and invalidation.',
    },
    {
        icons: [Plug],
        title: 'Adapters',
        href: '/docs/adapters/express',
        description: 'Mount your API on Express, Fastify, Hono, or Next.js.',
    },
    {
        icons: [KeyRound],
        title: 'Typed authentication',
        href: '/docs/authentication',
        description: 'Identities and per-route authentication declared on the contract.',
    },
    {
        icons: [Radio],
        title: 'Streaming',
        href: '/docs/streaming',
        description: 'Stream an AI reply as typed events. Yield them from the handler, read them with for await in the client.',
    },
    {
        icons: [Wrench],
        title: 'Tools',
        href: '/docs/tools',
        description: 'Declare the tools an AI assistant can call. Run them on the server, and read each call typed in your client.',
    },
    {
        icons: [Puzzle],
        title: 'Plugins',
        href: '/docs/plugins',
        description: 'Extend your API with features built on the contract you already wrote, fully typed in your handlers.',
    },
    {
        icons: [Layers],
        title: 'Request context',
        href: '/docs/request-context',
        description: 'Declare request-scoped values once, and every handler receives them typed, resolved once per request.',
    },
    {
        icons: [Clock],
        title: 'Scheduled jobs',
        href: '/docs/jobs',
        description: 'Declare cron work next to its handler and tick it from any platform scheduler, or run it in process.',
    },
    {
        icons: [Timer],
        title: 'Caching',
        href: '/docs/caching',
        description: 'Declare a cache policy on a response and every adapter sends Cache-Control and Vary.',
    },
    {
        icons: [Zap],
        title: 'RPC-like client',
        href: '/docs/clients/fetch',
        description: 'Call your API like a function. Every route is a method with typed inputs and a response typed by status code.',
    },
    {
        icons: [TriangleAlert],
        title: 'Deprecation and sunset',
        href: '/docs/deprecations',
        description: 'Deprecate routes and fields, and it shows up in your editor, OpenAPI, Swift, Kotlin, and the response headers.',
    },
    {
        icons: [Section],
        title: 'Spec-driven everything',
        href: '/docs/standards',
        description: 'HTTP, OpenAPI, OAuth, and MCP: every status code, error body, and header sits where the spec says it should.',
    },
];
