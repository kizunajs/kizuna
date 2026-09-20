import type { ESLint, Linter, Rule } from 'eslint';
import parser from '@typescript-eslint/parser';
import packageJson from '../package.json';
import { noUnsupportedSchema } from './rules/no-unsupported-schema.js';

const plugin: ESLint.Plugin = {
    meta: {
        name: packageJson.name,
        version: packageJson.version,
        namespace: '@kizunajs',
    },
    rules: {
        'no-unsupported-schema': noUnsupportedSchema as unknown as Rule.RuleModule,
    },
};

/**
 * Flat config enabling every Kizuna rule.
 *
 * ```js
 * import kizuna from '@kizunajs/eslint-plugin';
 *
 * export default [kizuna.configs.recommended];
 * ```
 */
const recommended: Linter.Config = {
    name: '@kizunajs/recommended',
    files: ['**/*.ts', '**/*.cts', '**/*.mts', '**/*.tsx'],
    plugins: {
        '@kizunajs': plugin,
    },
    languageOptions: {
        parser: parser as Linter.Parser,
        parserOptions: {
            jsDocParsingMode: 'all',
        },
    },
    rules: {
        '@kizunajs/no-unsupported-schema': 'error',
    },
};

const eslintPlugin: ESLint.Plugin & { configs: { recommended: Linter.Config } } = {
    ...plugin,
    configs: {
        recommended,
    },
};

export default eslintPlugin;
