import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { watchConfig, type ConfigChange } from './watch-config.js';
import type { Contract, RouteDefinition, Routes } from '@ts-kizuna/core';

/**
 * `Contract['routes']` is a tree, so a group reads as `Routes | RouteDefinition`.
 * The fixture knows its own shape.
 */
const routePath = (contract: Contract | undefined, group: string, route: string): string | undefined => {
    const groupRoutes = contract?.routes[group] as Routes | undefined;
    return (groupRoutes?.[route] as RouteDefinition | undefined)?.path;
};

const cleanups: Array<() => void> = [];

afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
});

/**
 * A contract split over two files, so the watch set has to follow an import
 * rather than just the entry.
 */
const project = (routePath: string) => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'kizuna-watch-')));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));

    writeFileSync(
        join(directory, 'routes.ts'),
        `import { Kizuna } from '@ts-kizuna/core';
import { z } from 'zod';

const k = new Kizuna();

export const routes = k.routes('users', {
    getUser: {
        method: 'GET',
        path: '${routePath}',
        responses: { 200: z.object({ id: z.string() }) },
    },
});
`
    );

    writeFileSync(
        join(directory, 'contract.ts'),
        `import { defineConfig } from '@ts-kizuna/core';
import { routes } from './routes.js';

export const { api } = defineConfig({ routes: { users: routes } });
`
    );

    return directory;
};

/**
 * Waits for a debounced reload to land, rather than guessing at a duration that
 * holds when the whole suite is running.
 */
const waitFor = async (condition: () => boolean, nudge?: () => void, timeout = 15_000): Promise<void> => {
    const deadline = Date.now() + timeout;
    let elapsed = 0;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for the watcher');
        await new Promise((resolve) => setTimeout(resolve, 20));
        elapsed += 20;
        // `fs.watch` drops events when the machine is busy, which a full test
        // run makes it. Touching the file again asks for another.
        if (nudge && elapsed % 1000 === 0) nudge();
    }
};

const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

const routesSource = (routePath: string) => `import { Kizuna } from '@ts-kizuna/core';
import { z } from 'zod';

const k = new Kizuna();

export const routes = k.routes('users', {
    getUser: {
        method: 'GET',
        path: '${routePath}',
        responses: { 200: z.object({ id: z.string() }) },
    },
});
`;

describe('watchConfig', () => {
    it('reports the contract once before anything changes', async () => {
        const directory = project('/users/:id');
        const changes: ConfigChange[] = [];

        const stop = await watchConfig(join(directory, 'contract.ts'), (change) => {
            changes.push(change);
        });
        cleanups.push(stop);

        expect(changes).toHaveLength(1);
        expect(changes[0]?.changed).toBeUndefined();
        expect(routePath(changes[0]?.api, 'users', 'getUser')).toBe('/users/:id');
    });

    it('watches every file the contract was built from, not just the entry', async () => {
        const directory = project('/users/:id');
        const changes: ConfigChange[] = [];

        const stop = await watchConfig(join(directory, 'contract.ts'), (change) => {
            changes.push(change);
        });
        cleanups.push(stop);

        const files = changes[0]?.files ?? [];

        expect(files.some((file) => file.endsWith('contract.ts'))).toBe(true);
        expect(files.some((file) => file.endsWith('routes.ts'))).toBe(true);
        expect(files.every((file) => !file.includes('node_modules'))).toBe(true);
        expect(files.every((file) => file.includes(basename(directory)))).toBe(true);
    });

    it('reloads when an imported file changes', async () => {
        const directory = project('/users/:id');
        const changes: ConfigChange[] = [];

        const stop = await watchConfig(join(directory, 'contract.ts'), (change) => {
            changes.push(change);
        });
        cleanups.push(stop);

        writeFileSync(
            join(directory, 'routes.ts'),
            `import { Kizuna } from '@ts-kizuna/core';
import { z } from 'zod';

const k = new Kizuna();

export const routes = k.routes('users', {
    getUser: {
        method: 'GET',
        path: '/people/:id',
        responses: { 200: z.object({ id: z.string() }) },
    },
});
`
        );

        await waitFor(
            () => changes.length > 1,
            () => writeFileSync(join(directory, 'routes.ts'), routesSource('/people/:id'))
        );

        expect(changes.length).toBeGreaterThan(1);
        expect(routePath(changes.at(-1)?.api, 'users', 'getUser')).toBe('/people/:id');
        expect(changes.at(-1)?.changed).toContain('routes.ts');
    }, 20_000);

    it('keeps the last good contract when an edit does not parse', async () => {
        const directory = project('/users/:id');
        const changes: ConfigChange[] = [];
        const errors: unknown[] = [];

        const stop = await watchConfig(
            join(directory, 'contract.ts'),
            (change) => {
                changes.push(change);
            },
            {
                onError: (error) => errors.push(error),
            }
        );
        cleanups.push(stop);

        writeFileSync(join(directory, 'routes.ts'), 'export const routes = {');
        await waitFor(
            () => errors.length > 0,
            () => writeFileSync(join(directory, 'routes.ts'), 'export const routes = {')
        );

        expect(errors).toHaveLength(1);
        expect(changes).toHaveLength(1);
        expect(routePath(changes[0]?.api, 'users', 'getUser')).toBe('/users/:id');
    }, 20_000);

    it('reports a broken edit to stderr when nothing else is listening', async () => {
        const directory = project('/users/:id');
        const reported: unknown[] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => reported.push(args.join(' '));
        cleanups.push(() => {
            console.error = original;
        });

        const stop = await watchConfig(join(directory, 'contract.ts'), () => {});
        cleanups.push(stop);

        writeFileSync(join(directory, 'routes.ts'), 'export const routes = {');
        await waitFor(
            () => reported.length > 0,
            () => writeFileSync(join(directory, 'routes.ts'), 'export const routes = {')
        );

        expect(reported.join('\n')).toContain('Could not load the config after');
        expect(reported.join('\n')).toContain('routes.ts');
    }, 20_000);

    it('fails loudly when the contract is broken at startup', async () => {
        const directory = project('/users/:id');
        writeFileSync(join(directory, 'routes.ts'), 'export const routes = {');

        await expect(watchConfig(join(directory, 'contract.ts'), () => {})).rejects.toThrow();
    });

    it('stops watching when told to', async () => {
        const directory = project('/users/:id');
        const changes: ConfigChange[] = [];

        const stop = await watchConfig(join(directory, 'contract.ts'), (change) => {
            changes.push(change);
        });

        stop();
        writeFileSync(join(directory, 'routes.ts'), 'export const routes = {};');
        await settle();

        expect(changes).toHaveLength(1);
    });
});
