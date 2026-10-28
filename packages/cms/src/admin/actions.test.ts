import { describe, expect, it } from 'vitest';
import { toToolName } from 'kizunajs/generator';
import { itemActionCall, outcomeOf, shownActions, toolSegment } from './actions.js';

describe('the admin actions', () => {
    it('writes a route key the way kizuna names its tools', () => {
        for (const key of ['editing.actions.newsletters.send', 'editing.views.appUsers.actions.resetPassword', 'editing.listViews']) {
            expect(key.split('.').map(toolSegment).join('_')).toBe(toToolName(key));
        }
    });

    it('shows only the buttons that apply to the item as it stands', () => {
        expect(
            shownActions([
                {
                    name: 'send',
                    label: 'Send',
                    confirm: 'Send to everyone on the weekly list?',
                    available: true,
                },
                {
                    name: 'archive',
                    label: 'Archive',
                    available: false,
                },
            ]).map((action) => action.name)
        ).toEqual(['send']);
        expect(shownActions(undefined)).toEqual([]);
    });

    it("runs a collection's action on the item the ref names", () => {
        expect(itemActionCall('item:newsletters:n_1', 'send')).toEqual({
            name: 'editing_actions_newsletters_send',
            input: {
                params: {
                    id: 'n_1',
                },
            },
        });
        expect(itemActionCall('global:site', 'send')).toBeUndefined();
    });

    it('says the action ran, or what the server said was wrong', () => {
        expect(
            outcomeOf(
                {
                    status: 204,
                    body: undefined,
                },
                'Send'
            )
        ).toEqual({
            problem: false,
            message: 'Ran Send.',
        });
        expect(
            outcomeOf(
                {
                    status: 409,
                    body: {
                        detail: 'The item is not published. Publish it first.',
                    },
                },
                'Send'
            )
        ).toEqual({
            problem: true,
            message: 'The item is not published. Publish it first.',
        });
        expect(
            outcomeOf(
                {
                    status: 422,
                    body: {
                        detail: 'The data does not pass its fields.',
                        errors: [
                            {
                                path: ['email'],
                                message: 'Invalid email address',
                            },
                        ],
                    },
                },
                'Save'
            ).message
        ).toBe('The data does not pass its fields. email: Invalid email address.');
        expect(
            outcomeOf(
                {
                    status: 500,
                    body: undefined,
                },
                'Send'
            ).message
        ).toBe('Send did not run (500).');
    });
});
