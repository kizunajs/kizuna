import { defineConfig, devices } from '@playwright/test';

/**
 * The ports a run serves the sites on, which `E2E_GROUP_PORT`,
 * `E2E_UK_PORT` and `E2E_NORWAY_PORT` move for a run beside another.
 */
const ports = {
    group: process.env.E2E_GROUP_PORT ?? '3043',
    uk: process.env.E2E_UK_PORT ?? '3044',
    norway: process.env.E2E_NORWAY_PORT ?? '3045',
};

/**
 * Where each site answers during a run, beside the ports `pnpm dev` keeps.
 */
export const urls = {
    group: `http://group.localhost:${ports.group}`,
    uk: `http://uk.localhost:${ports.uk}`,
    norway: `http://norway.localhost:${ports.norway}`,
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
        url: `http://localhost:${ports.norway}/admin/login`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        env: {
            DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5496/postgres',
            KIZUNA_GROUP_URL: urls.group,
            KIZUNA_UK_URL: urls.uk,
            KIZUNA_NORWAY_URL: urls.norway,
            PORT: ports.group,
            UK_PORT: ports.uk,
            NORWAY_PORT: ports.norway,
            NEXT_DIST_DIR: '.next-e2e',
            UK_DIST_DIR: '.next-e2e/uk',
            NORWAY_DIST_DIR: '.next-e2e/norway',
        },
    },
});
