import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineConfig, Kizuna } from './index.js';
import { authenticate, contentOf } from './adapter.js';
import { defineContentProvider, definePlugin, route, type ContentRuntime } from './plugin.js';

const k = new Kizuna();

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) =>
        bearer?.token === 'editor-token'
            ? {
                  userId: 'ada',
              }
            : deny({
                  status: 401,
                  body: {
                      detail: 'Unauthorized',
                  },
              })
    );

const notesPlugin = definePlugin({
    slug: 'notes',
    setup: () => ({
        exports: {
            notes: ['Welcome'],
        },
    }),
});

const readNotes = route({
    method: 'GET',
    path: '/content/notes',
    auth: false,
    summary: 'Read the notes',
    responses: {
        200: z.object({
            notes: z.array(z.string()),
        }),
    },
}).handler(() => ({
    status: 200,
    body: {
        notes: ['Welcome'],
    },
}));

const notesContent = () =>
    defineContentProvider({
        plugin: notesPlugin(),
        routes: {
            content: {
                notes: readNotes,
            },
        },
        reader: ({ runtime }) => ({
            hasRuntime: runtime !== undefined,
        }),
        documents: () => [
            {
                ref: 'global:notes',
                kind: 'global' as const,
                name: 'notes',
                schema: z.object({
                    notes: z.array(z.string()),
                }),
                migration: 0,
            },
        ],
    });

const runtime: ContentRuntime = {
    cache: (read) => read,
    revalidate: () => undefined,
    draftMode: async () => ({
        enabled: false,
        enable: () => undefined,
        disable: () => undefined,
    }),
    cookies: async () => ({
        get: () => undefined,
        set: () => undefined,
        delete: () => undefined,
    }),
    notFound: async () => {
        throw new Error('not found');
    },
};

describe('content', () => {
    it("joins the provider's routes to the api's own and hands back its reader", () => {
        const kizuna = defineConfig({
            adapter: {
                name: 'test',
                mount: () => undefined,
                content: runtime,
            },
            content: notesContent(),
        });
        expect(Object.keys(kizuna.api.routes)).toEqual(['content']);
        expect(kizuna.content).toEqual({
            hasRuntime: true,
        });
        expect(
            contentOf(kizuna.api)
                ?.provider.documents()
                .map((document) => document.ref)
        ).toEqual(['global:notes']);
    });

    it('reads without a runtime when the adapter has none', () => {
        expect(
            defineConfig({
                content: notesContent(),
            }).content
        ).toEqual({
            hasRuntime: false,
        });
    });

    it('refuses a group of routes under the same name as the content', () => {
        expect(() =>
            defineConfig({
                routes: {
                    content: k.routes({}),
                },
                content: notesContent(),
            })
        ).toThrow("serves its routes under 'content'");
    });

    it('refuses something other than a provider', () => {
        expect(() =>
            defineConfig({
                content: {} as never,
            })
        ).toThrow('takes a content provider');
    });

    it('leaves an api without content alone', () => {
        expect(contentOf(defineConfig({}).api)).toBeUndefined();
    });
});

describe('authenticate', () => {
    const kizuna = defineConfig({
        auth: {
            identities: {
                editor,
            },
        },
        routes: {},
    });

    it("answers the guard's context for a credential it accepts", async () => {
        expect(
            await authenticate(kizuna.api, 'editor', {
                headers: {
                    authorization: 'Bearer editor-token',
                },
            })
        ).toEqual({
            userId: 'ada',
        });
    });

    it('answers undefined when the guard denies', async () => {
        expect(
            await authenticate(kizuna.api, 'editor', {
                headers: {},
            })
        ).toBeUndefined();
    });

    it('throws for an identity the api does not have', async () => {
        await expect(
            authenticate(kizuna.api, 'staff', {
                headers: {},
            })
        ).rejects.toThrow("no guard for the identity 'staff'");
    });
});
