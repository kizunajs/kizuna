'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Section } from '@/components/landing-page/section';
import panel from '@/components/landing-page/panel.module.css';
import { CodeWindow } from './code-window';
import styles from './handler-explorer.module.css';
import type { CodeCompletion } from './code-completion';
import { DocsLink } from '@/components/landing-page/docs-link';

interface Moment {
    id: string;
    note: string;
    code: string;
    completion?: CodeCompletion;
}

const MOMENTS: Moment[] = [
    {
        id: 'params',
        note: 'Typed from the path string itself. Rename a param and every handler that reads it fails to compile.',
        code: `getReport: k
    .route({
        method: 'GET',
        path: '/reports/:year/:month',
        responses: {
            200: ReportSchema,
        },
    })
    .handler(async ({ params }) => {
        const report = await db.reports.findFirst({
            where: {
                year: params.`,
        completion: {
            after: 'params.',
            items: ['year', 'month'],
            selected: 'year',
        },
    },
    {
        id: 'query',
        note: 'Numbers arrive as numbers and enums as enums, so you never reach for z.coerce.',
        code: `listUsers: k
    .route({
        method: 'GET',
        path: '/users',
        query: z.object({
            perPage: z.int().max(100),
            order: z.enum(['asc', 'desc']),
        }),
        responses: {
            200: z.array(UserSchema),
        },
    })
    .handler(async ({ query }) => {
        const users = await db.users.list(query.`,
        completion: {
            after: 'query.',
            items: ['perPage', 'order'],
            selected: 'perPage',
        },
    },
    {
        id: 'body',
        note: 'Validated against your schema before the handler runs, so invalid requests never reach your code.',
        code: `createUser: k
    .route({
        method: 'POST',
        path: '/users',
        body: z.object({
            name: z.string(),
            email: z.email(),
        }),
        responses: {
            201: UserSchema,
        },
    })
    .handler(async ({ body }) => {
        await mailer.sendWelcome(body.`,
        completion: {
            after: 'body.',
            items: ['email', 'name'],
            selected: 'email',
        },
    },
    {
        id: 'headers',
        note: 'Declared headers become literal keys, spelled exactly the way the spec spells them.',
        code: `updateUser: k
    .route({
        method: 'PATCH',
        path: '/users/:id',
        headers: z.object({
            'if-match': z.string(),
            'accept-language': z.string().optional(),
        }),
        responses: {
            200: UserSchema,
        },
    })
    .handler(async ({ params, headers }) => {
        const version = Number(headers['`,
        completion: {
            after: "headers['",
            items: ["'if-match'", "'accept-language'"],
            selected: "'if-match'",
        },
    },
    {
        id: 'auth',
        note: 'The guard has already verified the caller, so the handler receives a plain typed value.',
        code: `getMe: k
    .route({
        method: 'GET',
        path: '/me',
        auth: 'member',
        responses: {
            200: UserSchema,
        },
    })
    .handler(async ({ auth }) => ({
        status: 200,
        body: await db.users.findById(auth.member.workspaceUserId),
    })),`,
    },
    {
        id: 'requestContext',
        note: 'Declared once, resolved per request, available in every handler without touching a signature.',
        code: `listUsers: k
    .route({
        method: 'GET',
        path: '/users',
        responses: {
            200: z.array(UserSchema),
        },
    })
    .handler(async ({ requestContext }) => {
        await posthog.capture({
            event: 'users_listed',
            distinctId: requestContext.analytics.`,
        completion: {
            after: 'analytics.',
            items: ['distinctId', 'sessionId'],
            selected: 'distinctId',
        },
    },
    {
        id: 'jobs',
        note: 'Every job your config declares. Queue it and answer now, or run it and wait for the result.',
        code: `createUser: k
    .route({
        method: 'POST',
        path: '/users',
        body: CreateUserSchema,
        responses: {
            201: UserSchema,
        },
    })
    .handler(async ({ body, jobs }) => {
        await jobs.indexUser.`,
        completion: {
            after: 'indexUser.',
            items: ['queue', 'run'],
            selected: 'queue',
        },
    },
    {
        id: 'plugins',
        note: 'Plugins are named on your config, so their features arrive typed under their own names.',
        code: `updateUser: k
    .route({
        method: 'PATCH',
        path: '/users/:id',
        body: UserUpdateSchema,
        responses: {
            200: UserSchema,
        },
    })
    .handler(async ({ params, body, plugins }) => {
        await plugins.email.send({
            to: body.email,
            template: '`,
        completion: {
            after: "template: '",
            items: ["'welcome'", "'profile-updated'"],
            selected: "'profile-updated'",
        },
    },
    {
        id: 'throwError',
        note: 'Failure responses live on the route, so a handler can only throw what it declares.',
        code: `removeMember: k
    .route({
        method: 'DELETE',
        path: '/members/:userId',
        responses: {
            204: z.void(),
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
        },
    })
    .handler(async ({ params, throwError }) => {
        throwError({
            status: `,
        completion: {
            after: 'status:',
            items: ['404', '409'],
            selected: '409',
        },
    },
];

export function HandlerExplorer() {
    const [active, setActive] = useState(MOMENTS[0].id);
    const moment = MOMENTS.find((candidate) => candidate.id === active) ?? MOMENTS[0];

    return (
        <Section
            aside={<DocsLink href="/docs/routes" />}
            title="Your handler, fully typed"
            description="Params, body, auth, jobs and the rest arrive validated, so a wrong name fails to compile instead of failing in production.">
            <div className={panel.panel}>
                <div className={styles.split}>
                    <div className={styles.options} role="tablist" aria-label="Handler arguments">
                        {MOMENTS.map((candidate) => (
                            <button
                                key={candidate.id}
                                type="button"
                                role="tab"
                                aria-selected={candidate.id === active}
                                onClick={() => setActive(candidate.id)}
                                className={clsx(styles.option, candidate.id === active && styles.optionActive)}>
                                {candidate.id}
                            </button>
                        ))}
                    </div>

                    <div className={styles.main}>
                        <div className={styles.scene}>
                            {MOMENTS.map((candidate) => (
                                <div
                                    key={candidate.id}
                                    aria-hidden={candidate.id !== active}
                                    className={clsx(styles.sceneItem, candidate.id !== active && styles.sceneItemHidden)}>
                                    <CodeWindow lang="ts" code={candidate.code} completion={candidate.completion} />
                                </div>
                            ))}
                        </div>

                        <div className={panel.body}>
                            <Link href="/docs/routes#handler-arguments" className={panel.title}>
                                <code className={styles.argument}>{moment.id}</code>
                                <ArrowRight className={panel.arrow} aria-hidden />
                            </Link>
                            <p className={clsx(panel.text, styles.note)}>{moment.note}</p>
                        </div>
                    </div>
                </div>
            </div>
        </Section>
    );
}
