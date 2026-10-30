import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna, defineConfig } from 'kizunajs';
import { snapshotPathFor, toSchemaNode, toSnapshot } from './snapshot.js';

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

describe('brands in a snapshot', () => {
    const EmployeeId = Kizuna.brand('EmployeeId', z.string());
    const DepartmentId = Kizuna.brand('DepartmentId', z.string());
    const k = new Kizuna();
    const { api } = defineConfig({
        routes: [
            {
                getEmployee: k.route({
                    method: 'GET',
                    path: '/employees/:id',
                    pathParams: z.object({
                        id: EmployeeId,
                    }),
                    responses: {
                        200: z.object({
                            id: EmployeeId,
                            departmentId: DepartmentId.optional(),
                        }),
                    },
                }),
            },
        ],
    });
    const snapshot = toSnapshot(api);
    const route = snapshot.routes.getEmployee!;

    it('records the brand a scalar carries', () => {
        expect(route.responses['200']).toEqual({
            kind: 'object',
            fields: {
                id: {
                    optional: false,
                    schema: {
                        kind: 'string',
                        brand: 'EmployeeId',
                    },
                },
                departmentId: {
                    optional: true,
                    schema: {
                        kind: 'string',
                        brand: 'DepartmentId',
                    },
                },
            },
        });
    });

    it('records the path params', () => {
        expect(route.params).toEqual({
            kind: 'object',
            fields: {
                id: {
                    optional: false,
                    schema: {
                        kind: 'string',
                        brand: 'EmployeeId',
                    },
                },
            },
        });
    });

    it('lists every brand the routes carry', () => {
        expect(snapshot.brands).toEqual(['DepartmentId', 'EmployeeId']);
    });

    it('leaves the brand off when told to', () => {
        expect(
            toSchemaNode(EmployeeId, {
                brands: false,
            })
        ).toEqual({
            kind: 'string',
        });
    });
});
