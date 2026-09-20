import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import type { ClientTarget, ApiDefinition } from 'kizunajs';

/**
 * A client that was written, and whether it had to be.
 */
export interface WrittenClient {
    kind: string;
    output: string;
    changed: boolean;
}

/**
 * A generated client that does not match its api.
 */
export interface StaleClient {
    kind: string;
    output: string;
    /**
     * `missing` when nothing is there, `outdated` when what is there is old.
     */
    reason: 'missing' | 'outdated';
}

const currentContents = (output: string): string | undefined => {
    try {
        return readFileSync(output, 'utf8');
    } catch {
        return undefined;
    }
};

/**
 * Writes every client an api declares, leaving a file alone when it already
 * matches so watchers and build tools see no change.
 */
export const writeClients = (contract: ApiDefinition, clients: readonly ClientTarget[]): WrittenClient[] =>
    clients.map((client) => {
        const rendered = client.generate(contract);
        const changed = currentContents(client.output) !== rendered;

        if (changed) {
            mkdirSync(dirname(client.output), { recursive: true });
            writeFileSync(client.output, rendered);
        }

        return { kind: client.kind, output: client.output, changed };
    });

/**
 * Every client that no longer matches its api, without writing anything.
 *
 * This is what a pipeline runs: a generated client that has fallen behind is a
 * compile error waiting to happen in whatever imports it.
 */
export const checkClients = (contract: ApiDefinition, clients: readonly ClientTarget[]): StaleClient[] =>
    clients.flatMap((client): StaleClient[] => {
        const current = currentContents(client.output);
        if (current === undefined) return [{ kind: client.kind, output: client.output, reason: 'missing' }];
        if (current !== client.generate(contract)) return [{ kind: client.kind, output: client.output, reason: 'outdated' }];
        return [];
    });

/**
 * What a pipeline prints when a check fails, naming the command that fixes it
 * rather than printing a diff nobody reads.
 */
export const formatStale = (stale: readonly StaleClient[], command = 'kizuna generate'): string => {
    const lines = stale.map((client) => {
        const where = relative(process.cwd(), client.output);
        return client.reason === 'missing' ? `  ${where} has not been generated` : `  ${where} is behind the config`;
    });

    return [
        stale.length === 1 ? 'A generated client is out of date:' : `${stale.length} generated clients are out of date:`,
        ...lines,
        '',
        `Run \`${command}\` and commit the result.`,
    ].join('\n');
};
