import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import type { ApiDefinition, GeneratedFile } from 'kizunajs';

/**
 * A file that was written, and whether it had to be.
 */
export interface WrittenFile {
    output: string;
    changed: boolean;
}

/**
 * A generated file that does not match its api.
 */
export interface StaleFile {
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
 * Writes every generated file, the clients and what plugins generate, leaving
 * a file alone when it already matches so watchers and build tools see no
 * change.
 */
export const writeFiles = (contract: ApiDefinition, files: readonly GeneratedFile[]): WrittenFile[] =>
    files.map((file) => {
        const rendered = file.render(contract);
        const changed = currentContents(file.output) !== rendered;

        if (changed) {
            mkdirSync(dirname(file.output), { recursive: true });
            writeFileSync(file.output, rendered);
        }

        return { output: file.output, changed };
    });

/**
 * Every generated file that no longer matches its api, without writing
 * anything.
 *
 * This is what a pipeline runs: a generated client that has fallen behind is a
 * compile error waiting to happen in whatever imports it.
 */
export const checkFiles = (contract: ApiDefinition, files: readonly GeneratedFile[]): StaleFile[] =>
    files.flatMap((file): StaleFile[] => {
        const current = currentContents(file.output);
        if (current === undefined) return [{ output: file.output, reason: 'missing' }];
        if (current !== file.render(contract)) return [{ output: file.output, reason: 'outdated' }];
        return [];
    });

/**
 * What a pipeline prints when a check fails, naming the command that fixes it
 * rather than printing a diff nobody reads.
 */
export const formatStale = (stale: readonly StaleFile[], command = 'kizuna generate'): string => {
    const lines = stale.map((file) => {
        const where = relative(process.cwd(), file.output);
        return file.reason === 'missing' ? `  ${where} has not been generated` : `  ${where} is behind the config`;
    });

    return [
        stale.length === 1 ? 'A generated file is out of date:' : `${stale.length} generated files are out of date:`,
        ...lines,
        '',
        `Run \`${command}\` and commit the result.`,
    ].join('\n');
};
