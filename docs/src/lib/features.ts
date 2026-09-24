import { Clock, FileText, KeyRound, Plug, Radio, Section, Timer, TriangleAlert, Zap } from 'lucide-react';
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
     * Plain text, since it renders in both the landing cards and the docs list.
     */
    description: string;
}

export const features: Feature[] = [
    {
        icons: [FileText],
        title: 'OpenAPI generation',
        href: '/docs/openapi',
        description: 'Generate a complete OpenAPI spec from the routes you already wrote.',
    },
    {
        icons: [SwiftLogo, KotlinLogo],
        title: 'Native client generation',
        href: '/docs/clients/swift',
        description: 'Typed API clients for Swift (iOS/macOS) and Kotlin (Android/JVM).',
    },
    {
        icons: [McpLogo],
        title: 'MCP endpoint',
        href: '/docs/mcp',
        description: 'Mark a route as a tool and AI assistants can call it, with hints taken from its HTTP method.',
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
        description: 'Identities carrying their own guard, roles, and an auth on every route.',
    },
    {
        icons: [Radio],
        title: 'Streaming',
        href: '/docs/streaming',
        description: 'Stream an AI reply as typed events. Yield them from the handler, read them with for await.',
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
        description: 'Call your API like a function, with every response typed by its status code.',
    },
    {
        icons: [TriangleAlert],
        title: 'Deprecation and sunset',
        href: '/docs/deprecations',
        description: 'Deprecate once, and it reaches your editor, OpenAPI, Swift, Kotlin and headers.',
    },
    {
        icons: [Section],
        title: 'Spec-driven everything',
        href: '/docs/standards',
        description: 'Every status code, error body and header sits where the RFC says it should.',
    },
];
