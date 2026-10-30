import { defineConfig, devices } from '@playwright/test';

/**
 * Where each site answers during a run, beside the ports `pnpm dev` keeps.
 */
export const urls = {
    group: 'http://group.localhost:3043',
    uk: 'http://uk.localhost:3044',
    norway: 'http://norway.localhost:3045',
};

/**
 * Runs against its own three `next dev` servers on ports 3043 to 3045, with a
 * fresh database on port 5496 and their own build folders, so it never
 * touches the content or the servers of `pnpm dev`.
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
        url: 'http://localhost:3045/admin/login',
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        env: {
            DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5496/postgres',
            KIZUNA_GROUP_URL: urls.group,
            KIZUNA_UK_URL: urls.uk,
            KIZUNA_NORWAY_URL: urls.norway,
            PORT: '3043',
            UK_PORT: '3044',
            NORWAY_PORT: '3045',
            NEXT_DIST_DIR: '.next-e2e',
            UK_DIST_DIR: '.next-e2e/uk',
            NORWAY_DIST_DIR: '.next-e2e/norway',
        },
    },
});
