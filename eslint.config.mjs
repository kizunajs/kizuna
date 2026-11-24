// @ts-check

import { kizuna as kizunaTooling } from '@kizunajs/tooling/eslint';
import kizuna from '@kizunajs/eslint-plugin';

export default [
    ...kizunaTooling({
        ignores: [
            '**/.turbo',
            '**/.source',
            '**/.next',
            '**/.vercel',
            '**/.build',
            '**/.swiftpm',
            '**/DerivedData',
            '**/.kizuna',
            '**/next-env.d.ts',
            '**/__fixtures__/**',
        ],
    }),
    {
        files: ['**/*.fixture.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
        },
    },
    kizuna.configs.recommended,
];
