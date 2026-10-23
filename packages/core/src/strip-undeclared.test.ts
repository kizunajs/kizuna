import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { stripUndeclared } from './strip-undeclared.js';

describe('stripUndeclared', () => {
    it('leaves a value with nothing undeclared as it was, key for key', () => {
        const schema = z.object({
            id: z.string(),
            name: z.string(),
        });
        expect(
            JSON.stringify(
                stripUndeclared(schema, {
                    name: 'Ada',
                    id: '1',
                })
            )
        ).toBe('{"name":"Ada","id":"1"}');
    });

    it('looks through optional, nullable and readonly wrappers', () => {
        const schema = z.object({
            manager: z
                .object({
                    id: z.string(),
                })
                .nullable()
                .optional()
                .readonly(),
        });
        expect(
            stripUndeclared(schema, {
                manager: {
                    id: '2',
                    salary: 98000,
                },
            })
        ).toEqual({
            manager: {
                id: '2',
            },
        });
        expect(
            stripUndeclared(schema, {
                manager: null,
            })
        ).toEqual({
            manager: null,
        });
    });

    it('strips by the input side of a transform', () => {
        const schema = z
            .object({
                firstName: z.string(),
                lastName: z.string(),
            })
            .transform((name) => `${name.firstName} ${name.lastName}`);
        expect(
            stripUndeclared(schema, {
                firstName: 'Ada',
                lastName: 'Lovelace',
                birthNumber: '10121815',
            })
        ).toEqual({
            firstName: 'Ada',
            lastName: 'Lovelace',
        });
    });

    it('strips each tuple item and the rest', () => {
        const Point = z.object({
            x: z.number(),
        });
        const schema = z.tuple([Point], Point);
        expect(
            stripUndeclared(schema, [
                {
                    x: 1,
                    label: 'a',
                },
                {
                    x: 2,
                    label: 'b',
                },
            ])
        ).toEqual([
            {
                x: 1,
            },
            {
                x: 2,
            },
        ]);
    });

    it('follows a recursive schema through z.lazy', () => {
        interface Category {
            name: string;
            children: Category[];
        }
        const CategorySchema: z.ZodType<Category> = z.lazy(() =>
            z.object({
                name: z.string(),
                children: z.array(CategorySchema),
            })
        );
        expect(
            stripUndeclared(CategorySchema, {
                name: 'Articles',
                internalId: 1,
                children: [
                    {
                        name: 'News',
                        internalId: 2,
                        children: [],
                    },
                ],
            })
        ).toEqual({
            name: 'Articles',
            children: [
                {
                    name: 'News',
                    children: [],
                },
            ],
        });
    });

    it('reads own enumerable fields only, as JSON does, never a getter', () => {
        class Employee {
            readonly salary = 98000;
            get name(): string {
                return 'Ada';
            }
        }
        const schema = z.object({
            name: z.string(),
        });
        expect(stripUndeclared(schema, new Employee())).toEqual({});
    });

    it('keeps a value under z.unknown() and z.any() whole', () => {
        const schema = z.object({
            metadata: z.unknown(),
            raw: z.any(),
        });
        const value = {
            metadata: {
                anything: true,
            },
            raw: [
                {
                    nested: 1,
                },
            ],
        };
        expect(stripUndeclared(schema, value)).toEqual(value);
    });

    it('picks the union option that keeps the most, an intersection among them', () => {
        const Summary = z.object({
            id: z.string(),
        });
        const schema = z.union([
            Summary,
            z.intersection(
                Summary,
                z.object({
                    name: z.string(),
                })
            ),
        ]);
        expect(
            stripUndeclared(schema, {
                id: '1',
                name: 'Ada',
                passwordHash: 'argon2id-hash',
            })
        ).toEqual({
            id: '1',
            name: 'Ada',
        });
    });

    it('drops what nothing declares where the value has the wrong shape', () => {
        const schema = z.object({
            name: z.string(),
            tags: z.array(z.string()),
        });
        expect(
            stripUndeclared(schema, {
                name: {
                    first: 'Ada',
                    birthNumber: '10121815',
                },
                tags: {
                    internal: 'payroll',
                },
            })
        ).toEqual({
            name: {},
            tags: {},
        });
    });

    it('sends a Date where a string was declared as the ISO string JSON writes', () => {
        const createdAt = new Date('2026-03-01T09:30:00.000Z');
        expect(
            JSON.stringify(
                stripUndeclared(
                    z.object({
                        createdAt: z.string(),
                    }),
                    {
                        createdAt,
                    }
                )
            )
        ).toBe('{"createdAt":"2026-03-01T09:30:00.000Z"}');
    });

    it('never adds a key the value does not carry', () => {
        const schema = z.object({
            role: z.string().default('member'),
            note: z.string().optional(),
        });
        expect(stripUndeclared(schema, {})).toEqual({});
    });
});

describe('stripUndeclared: what JSON would send', () => {
    class Money {
        readonly #cents: number;
        constructor(cents: number) {
            this.#cents = cents;
        }
        toJSON(): string {
            return (this.#cents / 100).toFixed(2);
        }
    }

    class EmployeeRecord {
        readonly #salary = 98000;
        constructor(
            readonly id: string,
            readonly name: string
        ) {}
        toJSON() {
            return {
                id: this.id,
                name: this.name,
                salaryBand: this.#salary > 90000 ? 'senior' : 'junior',
            };
        }
    }

    const EmployeeSchema = z.object({
        id: z.string(),
        name: z.string(),
        salaryBand: z.string(),
    });

    const cases: Array<{ name: string; schema: z.ZodType; body: unknown }> = [
        {
            name: 'a Date',
            schema: z.object({
                createdAt: z.date(),
            }),
            body: {
                createdAt: new Date('2026-03-01T09:30:00.000Z'),
            },
        },
        {
            name: 'a class with toJSON and private fields',
            schema: z.object({
                price: z.string(),
            }),
            body: {
                price: new Money(1250),
            },
        },
        {
            name: 'a class whose toJSON builds the object',
            schema: EmployeeSchema,
            body: new EmployeeRecord('1', 'Ada'),
        },
        {
            name: 'nested arrays',
            schema: z.object({
                grid: z.array(z.array(z.number())),
            }),
            body: {
                grid: [
                    [1, 2],
                    [3, 4],
                ],
            },
        },
        {
            name: 'null',
            schema: z
                .object({
                    id: z.string(),
                })
                .nullable(),
            body: null,
        },
        {
            name: 'a nullable field holding null',
            schema: z.object({
                manager: z
                    .object({
                        id: z.string(),
                    })
                    .nullable(),
            }),
            body: {
                manager: null,
            },
        },
        {
            name: 'an undefined field and an undefined array item',
            schema: z.object({
                note: z.string().optional(),
                tags: z.array(z.string().optional()),
            }),
            body: {
                note: undefined,
                tags: ['a', undefined],
            },
        },
        {
            name: 'a Map and a Set under z.unknown()',
            schema: z.object({
                lookup: z.unknown(),
                seen: z.unknown(),
            }),
            body: {
                lookup: new Map([['a', 1]]),
                seen: new Set([1]),
            },
        },
        {
            name: 'an object with inherited keys',
            schema: z.object({
                id: z.string(),
                inherited: z.string().optional(),
            }),
            body: Object.assign(
                Object.create({
                    inherited: 'from the prototype',
                }) as Record<string, unknown>,
                {
                    id: '1',
                }
            ),
        },
        {
            name: 'an array of class instances with toJSON',
            schema: z.array(EmployeeSchema),
            body: [new EmployeeRecord('1', 'Ada'), new EmployeeRecord('2', 'Grace')],
        },
    ];

    it.each(cases)('sends $name exactly as JSON.stringify does', ({ schema, body }) => {
        expect(JSON.stringify(stripUndeclared(schema, body))).toBe(JSON.stringify(body));
    });

    it('keeps nothing of a class instance where a string was declared', () => {
        class UserEntity {
            id = '1';
            passwordHash = 'argon2id-hash';
        }
        expect(
            JSON.stringify(
                stripUndeclared(
                    z.object({
                        owner: z.string(),
                    }),
                    {
                        owner: new UserEntity(),
                    }
                )
            )
        ).toBe('{"owner":{}}');
    });

    it('strips the array a union picks by its kind, not by the first option', () => {
        const User = z.object({
            id: z.string(),
        });
        expect(
            stripUndeclared(z.union([z.string(), z.array(User)]), [
                {
                    id: '1',
                    passwordHash: 'argon2id-hash',
                },
                {
                    id: 2,
                },
            ])
        ).toEqual([
            {
                id: '1',
            },
            {
                id: 2,
            },
        ]);
    });

    it('drops tuple items past the declared ones', () => {
        expect(
            stripUndeclared(z.tuple([z.string(), z.number()]), [
                'Ada',
                36,
                {
                    passwordHash: 'argon2id-hash',
                },
            ])
        ).toEqual(['Ada', 36]);
    });

    it('drops record keys outside an enum key type', () => {
        expect(
            stripUndeclared(z.record(z.enum(['nb', 'en']), z.string()), {
                nb: 'Forside',
                en: 'Front page',
                internalNote: 'draft',
            })
        ).toEqual({
            nb: 'Forside',
            en: 'Front page',
        });
    });
});

describe('stripUndeclared: cost', () => {
    interface Block {
        type: string;
        [key: string]: unknown;
    }

    const BlockSchema: z.ZodType<Block> = z.lazy(() =>
        z.discriminatedUnion('type', [
            z.object({
                type: z.literal('paragraph'),
                text: z.string(),
                children: z.array(BlockSchema),
            }),
            z.object({
                type: z.literal('list'),
                children: z.array(BlockSchema),
            }),
            z.object({
                type: z.literal('quote'),
                cite: z.string().optional(),
                children: z.array(BlockSchema),
            }),
        ])
    );

    const blockTree = (depth: number): Block =>
        depth === 0
            ? {
                  type: 'video',
                  url: 'https://example.com/clip.mp4',
                  internalNote: 'not declared',
              }
            : {
                  type: ['paragraph', 'list', 'quote'][depth % 3]!,
                  text: 'Hello',
                  children: [blockTree(depth - 1)],
              };

    /**
     * The second run, so the time is the walk and not the one-off reading of the schema.
     */
    const timed = (run: () => unknown): number => {
        run();
        const started = performance.now();
        run();
        return performance.now() - started;
    };

    it('strips a recursive discriminated union with an unknown leaf, 12 levels deep, in under 50 ms', () => {
        const tree = blockTree(12);
        expect(timed(() => stripUndeclared(BlockSchema, tree))).toBeLessThan(50);
        expect(JSON.stringify(stripUndeclared(BlockSchema, tree))).not.toContain('internalNote');
    });

    interface TreeNode {
        id: string;
        name?: string;
        children: TreeNode[];
    }

    const NodeSchema: z.ZodType<TreeNode> = z.lazy(() => {
        const Base = z.object({
            id: z.string(),
            children: z.array(NodeSchema),
        });
        return z.union([
            Base,
            Base.extend({
                name: z.string(),
            }),
        ]);
    });

    const chain = (depth: number): TreeNode => ({
        id: String(depth),
        name: `Node ${depth}`,
        children: depth === 0 ? [] : [chain(depth - 1)],
    });

    it('picks among 200 union options for 20 items in under 50 ms', () => {
        const options = Array.from({ length: 200 }, (_, index) =>
            z.object({
                [`field${index}`]: z.string(),
                shared: z.string(),
            })
        );
        const schema = z.array(z.union(options as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]]));
        const items = Array.from({ length: 20 }, (_, index) => ({
            [`field${index}`]: 'value',
            shared: 'value',
            internalNote: 'not declared',
        }));
        expect(timed(() => stripUndeclared(schema, items))).toBeLessThan(50);
    });

    it('resolves a union of shared unions 20 levels deep in under 50 ms', () => {
        let level: z.ZodType = z.object({
            id: z.string(),
        });
        for (let depth = 0; depth < 20; depth += 1) {
            const shared = level;
            level = z.union([shared, z.union([shared, shared])]);
        }
        const schema = level;
        expect(
            timed(() =>
                stripUndeclared(schema, {
                    id: '1',
                    internalNote: 'not declared',
                })
            )
        ).toBeLessThan(50);
    });

    it('strips an overlapping union 16 levels deep in under 50 ms, keeping the wider option', () => {
        const tree = chain(16);
        expect(timed(() => stripUndeclared(NodeSchema, tree))).toBeLessThan(50);
        expect(JSON.stringify(stripUndeclared(NodeSchema, tree))).toBe(JSON.stringify(tree));
    });
});

describe('stripUndeclared: keeping every declared field', () => {
    it('keeps the fields of the discriminated union an object is intersected with', () => {
        const schema = z
            .object({
                id: z.string(),
            })
            .and(
                z.discriminatedUnion('type', [
                    z.object({
                        type: z.literal('article'),
                        title: z.string(),
                    }),
                    z.object({
                        type: z.literal('employee'),
                        name: z.string(),
                    }),
                ])
            );
        expect(
            stripUndeclared(schema, {
                id: '1',
                type: 'article',
                title: 'Front page',
                draftNotes: 'not declared',
            })
        ).toEqual({
            id: '1',
            type: 'article',
            title: 'Front page',
        });
    });

    it('keeps the fields of the union option an object is intersected with', () => {
        const schema = z
            .object({
                id: z.string(),
            })
            .and(
                z.union([
                    z.object({
                        title: z.string(),
                    }),
                    z.object({
                        name: z.string(),
                    }),
                ])
            );
        expect(
            stripUndeclared(schema, {
                id: '1',
                title: 'Front page',
                draftNotes: 'not declared',
            })
        ).toEqual({
            id: '1',
            title: 'Front page',
        });
    });

    it('lets an intersected record take the keys the object leaves out', () => {
        const schema = z
            .object({
                id: z.string(),
            })
            .and(z.record(z.string(), z.string()));
        expect(
            stripUndeclared(schema, {
                id: '1',
                locale: 'nb',
            })
        ).toEqual({
            id: '1',
            locale: 'nb',
        });
    });

    it('keeps the fields both unions of an intersection pick', () => {
        const schema = z
            .union([
                z.object({
                    title: z.string(),
                }),
                z.object({
                    name: z.string(),
                }),
            ])
            .and(
                z.union([
                    z.object({
                        publishedAt: z.string(),
                    }),
                    z.object({
                        hiredAt: z.string(),
                    }),
                ])
            );
        expect(
            stripUndeclared(schema, {
                title: 'Front page',
                publishedAt: '2026-03-01',
                draftNotes: 'not declared',
            })
        ).toEqual({
            title: 'Front page',
            publishedAt: '2026-03-01',
        });
    });

    it('rules out a plain union option whose literal field disagrees with the value', () => {
        const schema = z.union([
            z.object({
                type: z.literal('text'),
                value: z.string(),
            }),
            z.object({
                type: z.literal('point'),
                value: z.object({
                    x: z.number(),
                }),
            }),
        ]);
        expect(
            stripUndeclared(schema, {
                type: 'point',
                value: {
                    x: 1,
                },
            })
        ).toEqual({
            type: 'point',
            value: {
                x: 1,
            },
        });
    });

    it('breaks a tie between plain union options by the kind of each field', () => {
        const schema = z.union([
            z.object({
                value: z.string(),
            }),
            z.object({
                value: z.object({
                    x: z.number(),
                }),
            }),
        ]);
        expect(
            stripUndeclared(schema, {
                value: {
                    x: 1,
                    label: 'not declared',
                },
            })
        ).toEqual({
            value: {
                x: 1,
            },
        });
    });

    it('picks the array option whose items fit the value', () => {
        const User = z.object({
            id: z.string(),
        });
        expect(
            stripUndeclared(z.union([z.array(z.string()), z.array(User)]), [
                {
                    id: '1',
                    passwordHash: 'argon2id-hash',
                },
                {
                    id: '2',
                },
            ])
        ).toEqual([
            {
                id: '1',
            },
            {
                id: '2',
            },
        ]);
    });

    it('picks the record option whose values fit the value', () => {
        const Item = z.object({
            x: z.number(),
        });
        expect(
            stripUndeclared(z.union([z.record(z.string(), z.string()), z.record(z.string(), Item)]), {
                first: {
                    x: 1,
                },
            })
        ).toEqual({
            first: {
                x: 1,
            },
        });
    });
});

describe('stripUndeclared: one option per value', () => {
    it('sends the first of two tied options, never fields from both', () => {
        const schema = z.union([
            z.object({
                id: z.string(),
                name: z.string(),
                email: z.string(),
            }),
            z.object({
                id: z.string(),
                name: z.string(),
                ssn: z.string(),
            }),
        ]);
        expect(
            stripUndeclared(schema, {
                id: '1',
                name: 'Ada',
                email: 'ada@example.com',
                ssn: '10121815',
            })
        ).toEqual({
            id: '1',
            name: 'Ada',
            email: 'ada@example.com',
        });
    });

    it('keeps the public option when it ties with a wider one', () => {
        const schema = z.union([
            z.object({
                id: z.string(),
                bio: z.string().optional(),
            }),
            z.object({
                id: z.string(),
                email: z.string(),
            }),
        ]);
        expect(
            stripUndeclared(schema, {
                id: '1',
                bio: 'Mathematician',
                email: 'ada@example.com',
            })
        ).toEqual({
            id: '1',
            bio: 'Mathematician',
        });
    });

    it('picks the array option that fits every item, not just the first', () => {
        const Cat = z.object({
            name: z.string(),
        });
        const Dog = z.object({
            name: z.string(),
            breed: z.string(),
        });
        expect(
            stripUndeclared(z.union([z.array(Cat), z.array(Dog)]), [
                {
                    name: 'Rex',
                },
                {
                    name: 'Fido',
                    breed: 'Collie',
                },
            ])
        ).toEqual([
            {
                name: 'Rex',
            },
            {
                name: 'Fido',
                breed: 'Collie',
            },
        ]);
    });
});

describe('stripUndeclared: sparse arrays', () => {
    /**
     * Holes at the start, in the middle and at the end, with values between.
     */
    const sparse = (first: unknown, second: unknown): unknown[] => {
        const items: unknown[] = new Array(5);
        items[1] = first;
        items[3] = second;
        return items;
    };

    it.each([
        {
            name: 'an array of strings',
            schema: z.array(z.string()),
            body: sparse('x', 'z'),
        },
        {
            name: 'an array of dates',
            schema: z.array(z.date()),
            body: sparse(new Date('2026-03-01T09:30:00.000Z'), new Date('2026-03-02T09:30:00.000Z')),
        },
        {
            name: 'an array under z.any()',
            schema: z.array(z.any()),
            body: sparse(
                {
                    id: '1',
                },
                [1, 2]
            ),
        },
        {
            name: 'a tuple',
            schema: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]),
            body: sparse('x', 'z'),
        },
        {
            name: 'a tuple with a rest',
            schema: z.tuple([z.string()], z.string()),
            body: sparse('x', 'z'),
        },
    ])('writes each hole of $name as null, keeping every item in place', ({ schema, body }) => {
        expect(JSON.stringify(stripUndeclared(schema, body))).toBe(JSON.stringify(body));
    });
});
