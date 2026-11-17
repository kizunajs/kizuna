import type { KizunaConfigShape } from './configured.js';

/**
 * One entry `typescript.extend` adds to the `Config` that `kizuna generate`
 * writes. Each key becomes a key of `Config`. Inside it, a list of strings is
 * written as a union of them, and an object nests.
 *
 * A class that extends `Kizuna` reads its entry back, so a method it adds to
 * `k` can check a name against the others.
 *
 * @example
 * typescript: {
 *     extend: [
 *         {
 *             reports: {
 *                 names: ['daily', 'weekly'],
 *             },
 *         },
 *     ],
 * },
 *
 * // kizuna.types.ts, written by kizuna generate
 * export interface Config {
 *     reports: {
 *         names: 'daily' | 'weekly';
 *     };
 * }
 */
export type ConfigExtension = Readonly<Record<string, ConfigExtensionValues>>;

/**
 * The inside of a {@link ConfigExtension}: lists of strings, and objects of them.
 */
export interface ConfigExtensionValues {
    readonly [key: string]: readonly string[] | ConfigExtensionValues;
}

/**
 * The keys Kizuna.js writes into `Config` itself. Declared as a record, so a key
 * added to `KizunaConfigShape` has to be added here too.
 */
const CONFIG_KEYS: Record<keyof KizunaConfigShape, true> = {
    adapter: true,
    groups: true,
    auth: true,
    requestContext: true,
    validation: true,
    jobs: true,
    plugins: true,
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const assertValues = (values: unknown, path: string): void => {
    if (!isPlainObject(values)) {
        throw new Error(
            `\`typescript.extend\` gives '${path}' something other than an object. Each key holds a list of strings, or an object of them.`
        );
    }
    for (const [key, value] of Object.entries(values)) {
        if (isPlainObject(value)) {
            assertValues(value, `${path}.${key}`);
            continue;
        }
        if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
            throw new Error(`\`typescript.extend\` gives '${path}.${key}' something other than a list of strings or an object of them.`);
        }
    }
};

/**
 * Every name is free, used once, and holds only what the types file can write.
 */
export const assertConfigExtensions = (extensions: readonly ConfigExtension[] | undefined): void => {
    const taken = new Set<string>();
    for (const extension of extensions ?? []) {
        for (const [name, values] of Object.entries(extension)) {
            if (name in CONFIG_KEYS) {
                throw new Error(
                    `\`typescript.extend\` names '${name}', which Kizuna.js already writes into \`Config\`. Pick another name.`
                );
            }
            if (taken.has(name)) {
                throw new Error(`\`typescript.extend\` names '${name}' twice. Each name is added to \`Config\` once.`);
            }
            taken.add(name);
            assertValues(values, name);
        }
    }
};
