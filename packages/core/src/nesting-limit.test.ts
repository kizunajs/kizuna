import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineConfig } from './define-config.js';
import { Kizuna } from './kizuna.js';
import { nestsDeeperThan } from './nesting-limit.js';

/**
 * Returns arrays nested `levels` deep, like `[[[]]]` for 3.
 */
const arraysOf = (levels: number): unknown => JSON.parse('['.repeat(levels) + ']'.repeat(levels));

describe('nestsDeeperThan', () => {
    it('counts each object and array as one level', () => {
        expect(
            nestsDeeperThan(
                {
                    title: 'Write the report',
                    tags: ['work'],
                },
                2
            )
        ).toBe(false);
        expect(nestsDeeperThan(arraysOf(3), 3)).toBe(false);
        expect(nestsDeeperThan(arraysOf(4), 3)).toBe(true);
    });

    it('takes plain values at any limit', () => {
        expect(nestsDeeperThan('Write the report', 1)).toBe(false);
        expect(nestsDeeperThan(null, 1)).toBe(false);
    });

    it('walks 100,000 levels without overflowing the stack', () => {
        expect(nestsDeeperThan(arraysOf(100_000), 64)).toBe(true);
    });
});

describe('defineConfig nestingLimit', () => {
    const k = new Kizuna();
    const routesWith = (nestingLimit?: number) =>
        k.routes({
            listTasks: k
                .route({
                    method: 'GET',
                    path: '/tasks',
                    auth: false,
                    ...(nestingLimit === undefined
                        ? {}
                        : {
                              nestingLimit,
                          }),
                    responses: {
                        204: z.void(),
                    },
                })
                .handler(() => ({
                    status: 204,
                })),
        });

    it('refuses a limit that is not a whole number of levels above zero', () => {
        expect(() =>
            defineConfig({
                routes: [routesWith(0)],
            })
        ).toThrow("Route 'listTasks' sets `nestingLimit` to 0.");
        expect(() =>
            defineConfig({
                routes: [routesWith()],
                nestingLimit: 2.5,
            })
        ).toThrow('The config sets `nestingLimit` to 2.5.');
    });
});
