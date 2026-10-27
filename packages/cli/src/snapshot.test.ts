import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { snapshotPathFor, toSchemaNode } from './snapshot.js';

describe('where a snapshot lives', () => {
    it('names the default config api', () => {
        expect(snapshotPathFor('kizuna.config.ts')).toBe('.kizuna/snapshot.yaml');
    });

    it('names a second api after the part that distinguishes it', () => {
        expect(snapshotPathFor('kizuna.admin.config.ts')).toBe('.kizuna/admin.snapshot.yaml');
        expect(snapshotPathFor('admin.config.ts')).toBe('.kizuna/admin.snapshot.yaml');
    });

    it('sits beside the config it describes', () => {
        expect(snapshotPathFor('apps/api/kizuna.config.ts')).toBe('apps/api/.kizuna/snapshot.yaml');
    });
});

describe('nullability in a snapshot', () => {
    const node = toSchemaNode(
        z.object({
            name: z.string(),
            nickname: z.string().nullable(),
            avatarUrl: z.string().nullish(),
            tags: z.array(z.string().nullable()),
        })
    );
    const fields = (node as Extract<typeof node, { kind: 'object' }>).fields;

    it('records a nullable field', () => {
        expect(fields.nickname).toEqual({
            optional: false,
            schema: {
                kind: 'string',
                nullable: true,
            },
        });
    });

    it('records a nullish field as optional and nullable', () => {
        expect(fields.avatarUrl).toEqual({
            optional: true,
            schema: {
                kind: 'string',
                nullable: true,
            },
        });
    });

    it('records a nullable array element', () => {
        expect(fields.tags!.schema).toEqual({
            kind: 'array',
            element: {
                kind: 'string',
                nullable: true,
            },
        });
    });

    it('leaves the key off a field that is never null', () => {
        expect(fields.name!.schema).toEqual({
            kind: 'string',
        });
    });
});
