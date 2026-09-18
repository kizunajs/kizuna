import type { defineConfig } from './define-config.js';
import type { Kizuna, K } from './kizuna.js';

/**
 * Member names the CLI's deprecation parser and the ESLint plugin match on in
 * source text. Asserted against the real surface so a rename fails to compile
 * here rather than silently matching nothing.
 */
export const AUTHORING_NAMES = {
    model: 'model',
    routes: 'routes',
    defineConfig: 'defineConfig',
    router: 'router',
} as const satisfies {
    model: keyof typeof Kizuna;
    routes: keyof K;
    defineConfig: typeof defineConfig extends unknown ? 'defineConfig' : never;
    router: string;
};

/**
 * Export names the deprecation parser treats as a contract entry point.
 */
export const CONTRACT_EXPORT_NAMES = ['api'] as const;
