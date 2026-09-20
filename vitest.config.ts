import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
        testTimeout: 30_000,
        hookTimeout: 30_000,
        typecheck: {
            enabled: true,
            tsconfig: './tsconfig.test.json',
            include: ['packages/**/*.test-d.ts'],
        },
    },
});
