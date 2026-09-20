import { Kizuna } from 'kizunajs';
import { ProblemDetailsSchema } from 'kizunajs/schemas';
import { z } from 'zod';
import { k } from '../k';

export const EmailEvent = Kizuna.model({
    title: 'EmailEvent',
    schema: z.object({
        channel: z.literal('email'),
        to: z.email(),
        subject: z.string(),
    }),
});

export const SmsEvent = Kizuna.model({
    title: 'SmsEvent',
    schema: z.object({
        channel: z.literal('sms'),
        phone: z.string(),
        text: z.string(),
    }),
});

export const NotificationEvent = Kizuna.model({
    title: 'NotificationEvent',
    schema: z.discriminatedUnion('channel', [EmailEvent, SmsEvent]),
});

export const UserSessionEvent = Kizuna.model({
    title: 'UserSessionEvent',
    schema: z.discriminatedUnion('kind', [
        z.object({
            kind: z.literal('login'),
            at: z.iso.datetime(),
            ipAddress: z.string(),
            userAgent: z.string(),
        }),
        z.object({
            kind: z.literal('logout'),
            at: z.iso.datetime(),
            reason: z.enum(['signed_out', 'session_expired']),
        }),
    ]),
});

export const EventKind = Kizuna.model({
    title: 'EventKind',
    schema: z.enum(['login', 'logout', 'signup']),
});

export const EventRecord = Kizuna.model({
    title: 'EventRecord',
    schema: z.object({
        id: z.string(),
        kind: EventKind,
        occurredAt: z.iso.datetime(),
        userId: z.string(),
    }),
});

export const notificationsRoutes = k.routes('notifications', {
    sendNotification: k
        .route({
            method: 'POST',
            path: '/notifications',
            auth: false,
            tags: ['notifications', 'health'],
            body: NotificationEvent,
            responses: {
                202: z.object({
                    accepted: z.boolean(),
                }),
            },
            summary: 'Send a notification (discriminated by channel)',
        })
        .handler(() => {
            return {
                status: 202,
                body: {
                    accepted: true,
                },
            };
        }),
    listEvents: k
        .route({
            method: 'GET',
            path: '/events',
            auth: false,
            query: z.object({
                since: z.date().optional().meta({
                    description: 'Lower bound for occurredAt, wire format is ISO-8601',
                }),
                kind: EventKind.optional(),
                ids: z.array(z.string()).optional().meta({
                    description: 'Filter by id; repeated query param',
                }),
                label: z
                    .string()
                    .transform((value) => value.trim())
                    .optional()
                    .meta({
                        description: 'Arbitrary label, exercises z.string().transform()',
                    }),
                tagIds: z
                    .union([z.array(z.string()), z.string().transform((id) => [id])])
                    .optional()
                    .meta({
                        description: 'One or many tag IDs, exercises non-discriminated union codegen',
                    }),
            }),
            responses: {
                200: z.object({
                    events: z.array(EventRecord),
                    echo: z.object({
                        since: z.iso.datetime().nullable(),
                        kind: EventKind.nullable(),
                        ids: z.array(z.string()).nullable(),
                        label: z.string().nullable(),
                        tagIds: z.array(z.string()).nullable(),
                        sessionId: z.string().nullable(),
                    }),
                }),
            },
            summary: 'List events, exercises Date / enum / array query params',
        })
        .handler(({ query, requestContext }) => {
            return {
                status: 200,
                body: {
                    events: [
                        {
                            id: 'evt_1',
                            kind: 'login',
                            occurredAt: '2026-04-01T10:00:00.000Z',
                            userId: '1',
                        },
                    ],
                    echo: {
                        since: query.since ? query.since.toISOString() : null,
                        kind: query.kind ?? null,
                        ids: query.ids ?? null,
                        label: query.label ?? null,
                        tagIds: query.tagIds ?? null,
                        sessionId: requestContext.analytics.sessionId,
                    },
                },
            };
        }),
    validateConfig: k
        .route({
            method: 'POST',
            path: '/schemas/validate',
            auth: false,
            body: z.object({
                default: z.string(),
                interval: z.int(),
            }),
            responses: {
                200: z
                    .object({
                        status: z.string(),
                    })
                    .meta({
                        description: 'Validation result',
                    }),
                400: ProblemDetailsSchema,
                401: z.void(),
            },
            summary: 'Validate schemas, exercises generator bug coverage',
        })
        .handler(() => ({
            status: 200,
            body: {
                status: 'ok',
            },
        })),
    webhook: k
        .route({
            method: 'POST',
            path: '/webhook',
            auth: false,
            body: z.any(),
            responses: {
                200: z.object({
                    received: z.boolean(),
                }),
            },
            summary: 'Receive arbitrary webhook payload, exercises z.any() / AnyCodable codegen',
        })
        .handler(() => ({
            status: 200,
            body: {
                received: true,
            },
        })),
});
