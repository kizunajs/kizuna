import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readMetaDescription, readMetaExtensible, readMetaId } from './generator.js';
import { Kizuna } from './kizuna.js';
import { toolJsonSchema } from './tool-definitions.js';

describe('Kizuna.model', () => {
    it('marks an enum or a discriminated union extensible', () => {
        const OrderStatus = Kizuna.model({
            title: 'OrderStatus',
            schema: z.enum(['open', 'shipped']),
            extensible: true,
        });
        const Activity = Kizuna.model({
            title: 'Activity',
            schema: z.discriminatedUnion('kind', [
                z.object({
                    kind: z.literal('taskCreated'),
                }),
            ]),
            extensible: true,
        });
        expect(readMetaExtensible(OrderStatus)).toBe(true);
        expect(readMetaExtensible(Activity)).toBe(true);
        expect(
            readMetaExtensible(
                Kizuna.model({
                    title: 'Priority',
                    schema: z.enum(['low', 'high']),
                })
            )
        ).toBe(false);
    });

    it("reads extensible from a schema's own metadata too", () => {
        expect(
            readMetaExtensible(
                z.enum(['open', 'shipped']).meta({
                    extensible: true,
                })
            )
        ).toBe(true);
    });

    it('refuses extensible on anything but an enum or a discriminated union', () => {
        expect(() =>
            Kizuna.model({
                title: 'User',
                schema: z.object({
                    id: z.string(),
                }),
                extensible: true,
            })
        ).toThrow("Model 'User' is `extensible`, which only an enum or a discriminated union can be.");
    });

    it('sets the meta id from title', () => {
        const User = Kizuna.model({
            title: 'User',
            schema: z.object({
                id: z.string(),
                name: z.string(),
            }),
        });
        expect(readMetaId(User)).toBe('User');
    });

    it('sets the meta description', () => {
        const User = Kizuna.model({
            title: 'User',
            description: 'A user in the system',
            schema: z.object({
                id: z.string(),
            }),
        });
        expect(readMetaDescription(User)).toBe('A user in the system');
    });

    it('works without description', () => {
        const EventKind = Kizuna.model({
            title: 'EventKind',
            schema: z.enum(['login', 'logout', 'signup']),
        });
        expect(readMetaId(EventKind)).toBe('EventKind');
        expect(readMetaDescription(EventKind)).toBeUndefined();
    });

    it('works with enum schemas', () => {
        const Status = Kizuna.model({
            title: 'Status',
            schema: z.enum(['active', 'inactive']),
        });
        expect(readMetaId(Status)).toBe('Status');
        expect(Status.safeParse('active').success).toBe(true);
        expect(Status.safeParse('invalid').success).toBe(false);
    });

    it('works with discriminated union schemas', () => {
        const Email = z.object({
            channel: z.literal('email'),
            to: z.string(),
        });
        const Sms = z.object({
            channel: z.literal('sms'),
            phone: z.string(),
        });
        const Notification = Kizuna.model({
            title: 'Notification',
            schema: z.discriminatedUnion('channel', [Email, Sms]),
        });
        expect(readMetaId(Notification)).toBe('Notification');
        expect(
            Notification.safeParse({
                channel: 'email',
                to: 'test@example.com',
            }).success
        ).toBe(true);
    });

    it('returns a schema usable in routes', () => {
        const User = Kizuna.model({
            title: 'User',
            schema: z.object({
                id: z.string(),
            }),
        });
        const result = User.safeParse({
            id: '123',
        });
        expect(result.success).toBe(true);
    });

    it('keeps the id through describe and meta', () => {
        const ArticleStatus = Kizuna.model({
            title: 'ArticleStatus',
            schema: z.enum(['draft', 'published']),
        });
        expect(readMetaId(ArticleStatus.describe('Set by the editor'))).toBe('ArticleStatus');
        expect(
            readMetaId(
                ArticleStatus.meta({
                    deprecated: true,
                })
            )
        ).toBe('ArticleStatus');
    });

    it('drops the id when a copy changes validation', () => {
        const Article = Kizuna.model({
            title: 'Article',
            schema: z.object({
                title: z.string(),
            }),
        });
        expect(readMetaId(Article.refine((article) => article.title.length > 0))).toBeUndefined();
    });

    it('keeps the dots in a dotted title', () => {
        const Invoice = Kizuna.model({
            title: 'Billing.Invoice',
            schema: z.object({
                id: z.string(),
            }),
        });
        expect(readMetaId(Invoice)).toBe('Billing.Invoice');
    });

    it('rejects a dotted title with an empty name in it', () => {
        for (const title of ['Billing..Invoice', '.Invoice', 'Billing.']) {
            expect(() =>
                Kizuna.model({
                    title,
                    schema: z.object({
                        id: z.string(),
                    }),
                })
            ).toThrow(`Kizuna.model: ${JSON.stringify(title)} needs a name on both sides of every dot, like "Billing.Invoice".`);
        }
    });

    it('gives a tool a reference to a dotted model it can resolve', () => {
        const InvoiceLine = Kizuna.model({
            title: 'Billing.InvoiceLine',
            schema: z.object({
                amount: z.number(),
            }),
        });
        const schema = toolJsonSchema(
            z.object({
                first: InvoiceLine,
                second: InvoiceLine,
            }),
            'input'
        );
        expect(schema.properties).toEqual({
            first: {
                $ref: '#/$defs/Billing.InvoiceLine',
            },
            second: {
                $ref: '#/$defs/Billing.InvoiceLine',
            },
        });
        expect(schema.$defs).toHaveProperty(['Billing.InvoiceLine']);
    });
});
