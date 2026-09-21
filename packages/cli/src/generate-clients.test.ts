import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna, type ClientTarget } from 'kizunajs';
import { defineConfig } from 'kizunajs';
import { checkClients, formatStale, writeClients } from './generate-clients.js';

const k = new Kizuna();

const contract = defineConfig({
    routes: {
        users: k.routes({
            getUser: k.route({
                method: 'GET',
                path: '/users/:id',
                responses: { 200: z.object({ id: z.string() }) },
            }),
        }),
    },
}).api;

const directories: string[] = [];

afterEach(() => {
    while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
});

const workspace = () => {
    const directory = mkdtempSync(join(tmpdir(), 'kizuna-generate-'));
    directories.push(directory);
    return directory;
};

const target = (output: string, body = 'generated'): ClientTarget => ({
    kind: 'fetch',
    output,
    generate: () => body,
});

describe('writeClients', () => {
    it('writes each client and says it changed', () => {
        const output = join(workspace(), 'client.ts');
        const written = writeClients(contract, [target(output)]);

        expect(written).toEqual([{ kind: 'fetch', output, changed: true }]);
        expect(readFileSync(output, 'utf8')).toBe('generated');
    });

    it('creates the directory a client asks for', () => {
        const output = join(workspace(), 'nested', 'deeper', 'client.ts');
        writeClients(contract, [target(output)]);

        expect(readFileSync(output, 'utf8')).toBe('generated');
    });

    it('leaves a file alone when it already matches', () => {
        const output = join(workspace(), 'client.ts');
        writeClients(contract, [target(output)]);
        const first = statSync(output).mtimeMs;

        const second = writeClients(contract, [target(output)]);

        expect(second[0]?.changed).toBe(false);
        expect(statSync(output).mtimeMs).toBe(first);
    });
});

describe('checkClients', () => {
    it('says nothing when every client matches', () => {
        const output = join(workspace(), 'client.ts');
        writeClients(contract, [target(output)]);

        expect(checkClients(contract, [target(output)])).toEqual([]);
    });

    it('reports a client that was never generated', () => {
        const output = join(workspace(), 'client.ts');

        expect(checkClients(contract, [target(output)])).toEqual([{ kind: 'fetch', output, reason: 'missing' }]);
    });

    it('reports a client that has fallen behind', () => {
        const output = join(workspace(), 'client.ts');
        writeFileSync(output, 'what the contract used to say');

        expect(checkClients(contract, [target(output)])).toEqual([{ kind: 'fetch', output, reason: 'outdated' }]);
    });

    it('writes nothing while checking', () => {
        const output = join(workspace(), 'client.ts');
        writeFileSync(output, 'stale');

        checkClients(contract, [target(output)]);

        expect(readFileSync(output, 'utf8')).toBe('stale');
    });
});

describe('formatStale', () => {
    it('names the command rather than printing a diff', () => {
        const output = join(workspace(), 'client.ts');
        const message = formatStale([{ kind: 'fetch', output, reason: 'outdated' }]);

        expect(message).toContain('is behind the config');
        expect(message).toContain('Run `kizuna generate` and commit the result.');
    });

    it('says which of several is at fault', () => {
        const directory = workspace();
        const message = formatStale([
            { kind: 'fetch', output: join(directory, 'client.ts'), reason: 'outdated' },
            { kind: 'swift', output: join(directory, 'APIClient.swift'), reason: 'missing' },
        ]);

        expect(message).toContain('2 generated files are out of date');
        expect(message).toContain('has not been generated');
    });
});
