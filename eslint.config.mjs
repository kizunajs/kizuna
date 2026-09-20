// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier/recommended';
import jsdoc from 'eslint-plugin-jsdoc';
import kizuna from '@kizunajs/eslint-plugin';

export default [
    ...tseslint.config(
        {
            ignores: [
                'node_modules',
                '**/dist',
                '**/build',
                '**/.turbo',
                '**/.source',
                '**/.next',
                '**/.vercel',
                '**/.build',
                '**/.swiftpm',
                '**/DerivedData',
                '**/.kizuna',
                '**/coverage',
                '**/next-env.d.ts',
                '**/__fixtures__/**',
            ],
        },
        eslint.configs.recommended,
        ...tseslint.configs.recommended,
        eslintConfigPrettier,
        {
            ...prettier,
            languageOptions: {},
            plugins: {
                ...prettier.plugins,
                jsdoc,
            },
            rules: {
                'prettier/prettier': 'warn',
                '@typescript-eslint/no-empty-object-type': 'off',
                '@typescript-eslint/no-unused-vars': [
                    'error',
                    {
                        args: 'after-used',
                        argsIgnorePattern: '^_',
                        varsIgnorePattern: '^_',
                        caughtErrors: 'none',
                    },
                ],
                '@typescript-eslint/no-explicit-any': 'off',
                'jsdoc/multiline-blocks': ['warn', { noSingleLineBlocks: true }],
                'jsdoc/require-asterisk-prefix': ['warn', 'always'],
            },
        }
    ),
    {
        files: ['**/*.test.ts', '**/*.test-d.ts', '**/*.fixture.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
        },
    },
    kizuna.configs.recommended,
];
