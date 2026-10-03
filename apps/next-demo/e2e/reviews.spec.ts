import { expect, test } from '@playwright/test';
import { openEditor, signIn } from './cms';

test('an editor names an owner and asks her to review, and she approves it so it can go live', async ({ browser }) => {
    const edda = await browser.newPage();
    await signIn(edda);
    let editor = await openEditor(edda, '/contact');
    await editor.locator('#field-heading-input').fill('Ask the growers');
    await editor.locator('#field-intro-input').fill('We answer every weekday from 9 to 16.');
    await editor.locator('#field-buttonLabel-input').fill('Send');
    await editor.locator('#field-thanks-input').fill('Thanks. We will be in touch today.');
    await expect(
        editor.getByRole('status').filter({
            hasText: 'Saved',
        })
    ).toBeVisible();

    await editor
        .getByRole('button', {
            name: 'Name an owner',
        })
        .click();
    await editor
        .getByRole('button', {
            name: /Kari Nordmann/,
        })
        .click();
    await expect(editor.locator('.k-owner')).toHaveText('Kari');

    await editor
        .getByRole('button', {
            name: 'Publish',
        })
        .click();
    const contact = editor.locator('.k-review-group', {
        hasText: 'Contact',
    });
    await expect(contact.getByText('Needs an approval before it goes live.')).toBeVisible();
    await editor
        .getByRole('button', {
            name: 'Ask for review',
        })
        .click();
    // The owner is suggested first, and already picked.
    await expect(editor.locator('.k-person').first()).toHaveAttribute('aria-pressed', 'true');
    await editor.getByPlaceholder('A note for the reviewers (optional)').fill('New opening hours from Monday.');
    await editor
        .getByRole('button', {
            name: 'Send request',
        })
        .click();
    await expect(contact.locator('.k-review-badge')).toHaveText('Waiting for Kari');
    await edda.close();

    const kari = await browser.newPage();
    await signIn(kari, 'kari@example.com');
    editor = await openEditor(kari, '/contact');
    await expect(editor.locator('.k-header .k-review-badge')).toHaveText('Edda asked you to review');
    await editor
        .getByRole('button', {
            name: /^Review/,
        })
        .click();
    await expect(editor.getByText('New opening hours from Monday.')).toBeVisible();
    await editor
        .getByRole('button', {
            name: /^Approve/,
        })
        .click();
    await expect(
        editor
            .locator('.k-review-group', {
                hasText: 'Contact',
            })
            .locator('.k-review-badge')
    ).toHaveText('Approved by Kari');
    await editor.locator('.k-review-actions .k-button-primary').click();
    await expect(editor.locator('.k-review')).toBeHidden();
    await expect(editor.locator('.k-status')).toHaveText('Published');
});
