import { defineConfig, devices } from '@playwright/test';

const PORT = 3031;

/**
 * Runs against its own `next dev` on port 3031, with a fresh PGlite database
 * on port 5498 and its own build folder, so it never touches the content or
 * the server of `pnpm dev`.
 */
export default defineConfig({
    testDir: './e2e',
    // Dev mode compiles each route on its first visit, which a busy machine makes slow.
    timeout: 120_000,
    expect: {
        timeout: 30_000,
    },
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],
    webServer: {
        command: 'pnpm run e2e:server',
        url: `http://localhost:${PORT}/login`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        env: {
            DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5498/postgres',
            NEXT_DIST_DIR: '.next-e2e',
            BETTER_AUTH_URL: `http://localhost:${PORT}`,
        },
    },
});
