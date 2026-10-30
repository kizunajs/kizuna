import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Where Hagen UK and the travel agency answer during a run. The group and
 * Norway are not started, so their refreshes fail, and nothing reaches the
 * sites `pnpm dev` keeps.
 */
export const urls = {
    group: 'http://group.localhost:3047',
    uk: 'http://uk.localhost:3048',
    norway: 'http://norway.localhost:3049',
    partner: 'http://partner.localhost:3050',
};

/**
 * Runs Hagen UK on port 3048 and the travel agency on 3050, with a fresh
 * database on port 5495, its own media folder and its own build folders, so it
 * runs beside `pnpm dev`, `pnpm dev:partner` and the other Playwright run.
 */
export default defineConfig({
    testDir: './e2e-partner',
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
    webServer: [
        {
            command: 'pnpm run e2e:partner:hagen',
            url: 'http://localhost:3048/admin/login',
            timeout: 300_000,
            reuseExistingServer: !process.env.CI,
            env: {
                DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5495/postgres',
                KIZUNA_MEDIA_ROOT: resolve(import.meta.dirname, '.media-partner-e2e'),
                KIZUNA_GROUP_URL: urls.group,
                KIZUNA_UK_URL: urls.uk,
                KIZUNA_NORWAY_URL: urls.norway,
                UK_PORT: '3048',
                UK_DIST_DIR: '.next-partner-e2e/uk',
                TRAVEL_AGENCY_INVALIDATE_URL: `${urls.partner}/api/invalidate`,
            },
        },
        {
            command: 'pnpm run partner:install && cd partner && pnpm dev',
            url: 'http://localhost:3050/',
            timeout: 300_000,
            reuseExistingServer: !process.env.CI,
            env: {
                PORT: '3050',
                NEXT_DIST_DIR: '.next-e2e',
                HAGEN_UK_API_URL: `${urls.uk}/api`,
            },
        },
    ],
});
