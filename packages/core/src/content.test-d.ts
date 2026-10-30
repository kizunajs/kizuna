import { test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { defineConfig } from './define-config.js';
import { defineContentProvider, definePlugin } from './plugin.js';

const k = new Kizuna();

const notesPlugin = definePlugin({
    slug: 'notes',
    setup: () => ({}),
});

const notesContent = defineContentProvider({
    plugin: notesPlugin(),
    routes: {},
    reader: () => undefined,
    documents: () => [],
});

const refreshingContent = defineContentProvider({
    plugin: notesPlugin(),
    routes: {},
    reader: () => undefined,
    documents: () => [],
    jobs: k.jobs({
        refreshSite: k
            .job({
                input: z.object({
                    site: z.string(),
                }),
            })
            .handler(() => undefined),
    }),
});

test('a provider declaring jobs requires jobRunner', () => {
    // @ts-expect-error the provider's jobs need to say how they run
    defineConfig({
        content: refreshingContent,
    });

    defineConfig({
        content: refreshingContent,
        jobRunner: {
            mode: 'in-process',
        },
    });
});

test('a provider without jobs requires no jobRunner', () => {
    defineConfig({
        content: notesContent,
    });
});
