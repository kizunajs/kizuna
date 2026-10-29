import { describe, expect, it } from 'vitest';
import { hrefOf, isCurrent, navigationOf, screenOf, type Screen } from './navigation.js';
import {
    cellText,
    columnsOf,
    labelledValues,
    searchPlaceholder,
    viewActionCall,
    viewListCall,
    viewSaveCall,
    viewTool,
    withEdits,
    type ViewSummary,
} from './views.js';

const orders: ViewSummary = {
    name: 'orders',
    label: 'Orders',
    title: 'id',
    columns: ['id', 'customer', 'status'],
    search: ['id', 'customer'],
    readOnly: false,
};

const appUsers: ViewSummary = {
    name: 'appUsers',
    label: 'App users',
    title: 'name',
    columns: ['email'],
    search: [],
    readOnly: true,
};

describe('views in the admin', () => {
    it('reads back the view screens it writes into the address', () => {
        const screens: Screen[] = [
            {
                kind: 'view',
                name: 'appUsers',
            },
            {
                kind: 'record',
                view: 'appUsers',
                id: 'user/1',
            },
        ];
        for (const screen of screens) expect(screenOf(hrefOf(screen))).toEqual(screen);
    });

    it('lists views under their group, or Content', () => {
        const sections = navigationOf({
            globals: [],
            collections: [],
            views: [orders, appUsers],
            groups: {
                orders: 'Shop',
            },
        });
        expect(sections.map((section) => [section.label, section.entries.map((entry) => entry.label)])).toEqual([
            ['Content', ['Pages', 'Media', 'App users']],
            ['Shop', ['Orders']],
        ]);
    });

    it('marks a view current while one of its records is open', () => {
        const entry: Screen = {
            kind: 'view',
            name: 'orders',
        };
        expect(
            isCurrent(entry, {
                kind: 'record',
                view: 'orders',
                id: 'ord_4821',
            })
        ).toBe(true);
        expect(
            isCurrent(entry, {
                kind: 'record',
                view: 'appUsers',
                id: 'ord_4821',
            })
        ).toBe(false);
    });

    it("calls the view's routes by their tool names", () => {
        expect(viewTool('appUsers', 'get')).toBe('editing_views_app_users_get');
        expect(viewListCall('appUsers', '  ada ')).toEqual({
            name: 'editing_views_app_users_list',
            input: {
                query: {
                    q: 'ada',
                },
            },
        });
        expect(viewListCall('appUsers', ' ').input).toEqual({
            query: {},
        });
        expect(viewActionCall('appUsers', 'user_1', 'resetPassword')).toEqual({
            name: 'editing_views_app_users_actions_reset_password',
            input: {
                params: {
                    id: 'user_1',
                },
            },
        });
    });

    it('saves each field the editor changed, whole', () => {
        const item = {
            id: 'ord_4821',
            note: '',
            shipping: {
                carrier: 'Posten',
                tracking: null,
            },
        };
        const edits = {
            note: 'Gift wrap',
            'shipping.tracking': 'NO123',
        };
        expect(withEdits(item, edits)).toEqual({
            id: 'ord_4821',
            note: 'Gift wrap',
            shipping: {
                carrier: 'Posten',
                tracking: 'NO123',
            },
        });
        expect(item.shipping.tracking).toBeNull();
        expect(viewSaveCall('orders', 'ord_4821', item, edits)).toEqual({
            name: 'editing_views_orders_save',
            input: {
                params: {
                    id: 'ord_4821',
                },
                body: {
                    data: {
                        note: 'Gift wrap',
                        shipping: {
                            carrier: 'Posten',
                            tracking: 'NO123',
                        },
                    },
                },
            },
        });
    });

    it('shows the title first, then the other columns', () => {
        expect(columnsOf(orders)).toEqual(['id', 'customer', 'status']);
        expect(columnsOf(appUsers)).toEqual(['name', 'email']);
        expect(searchPlaceholder(orders)).toBe('Search id, customer');
        expect(searchPlaceholder(appUsers)).toBe('Search');
        expect(['Ada', 3, true, null, ['pro', 'beta']].map(cellText)).toEqual(['Ada', '3', 'Yes', '', 'pro, beta']);
    });

    it('shows a choice by the label of its option', () => {
        const withRoles: ViewSummary = {
            ...appUsers,
            columns: ['email', 'role'],
            options: {
                role: {
                    editor: 'Editor',
                    admin: 'Admin',
                },
            },
        };
        expect(
            labelledValues(withRoles, {
                email: 'ada@example.com',
                role: 'admin',
            })
        ).toEqual({
            email: 'ada@example.com',
            role: 'Admin',
        });
    });
});
