import { expect, test } from '@playwright/test';
import { urls } from '../playwright.config';
import { adminNav, signIn } from './admin';

const editors = [
    {
        email: 'ada@hagen.example.com',
        url: urls.group,
    },
    {
        email: 'una@hagen.example.com',
        url: urls.uk,
    },
    {
        email: 'sam@hagen.example.com',
        url: urls.uk,
    },
    {
        email: 'nils@hagen.example.com',
        url: urls.norway,
    },
    {
        email: 'kari@hagen.example.com',
        url: urls.norway,
    },
];

test.describe('the editors', () => {
    for (const editor of editors) {
        test(`${editor.email} signs in on their site`, async ({ page }) => {
            await signIn(page, editor.url, editor.email);
            await expect(adminNav(page)).toBeVisible();
        });
    }
});
