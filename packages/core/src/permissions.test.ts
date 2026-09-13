import { describe, expect, it } from 'vitest';
import { Kizuna } from './kizuna.js';
import { isPermissions, isRoles } from './permissions.js';

const permissions = Kizuna.permissions({
    workspace: ['read', 'update', 'delete'],
    project: ['create', 'read', 'delete'],
});

const roles = Kizuna.roles(permissions, {
    member: {
        workspace: ['read'],
        project: ['read'],
    },
    admin: {
        workspace: ['read', 'update'],
        project: ['create', 'read', 'delete'],
    },
    owner: 'all',
});

describe('Kizuna.permissions', () => {
    it('flattens the catalog to resource:verb names', () => {
        expect(permissions.names).toEqual([
            'workspace:read',
            'workspace:update',
            'workspace:delete',
            'project:create',
            'project:read',
            'project:delete',
        ]);
        expect(permissions.schema.options).toEqual(permissions.names);
        expect(isPermissions(permissions)).toBe(true);
    });

    it('rejects an empty catalog and an empty entry', () => {
        expect(() => Kizuna.permissions({})).toThrow(/at least one/);
        expect(() =>
            Kizuna.permissions({
                workspace: [],
            })
        ).toThrow(/no verbs/);
    });

    it('rejects a colon in a key or a verb', () => {
        expect(() =>
            Kizuna.permissions({
                'work:space': ['read'],
            })
        ).toThrow(/cannot contain ':'/);
        expect(() =>
            Kizuna.permissions({
                workspace: ['read:all'],
            })
        ).toThrow(/cannot contain ':'/);
    });
});

describe('Kizuna.roles from a catalog', () => {
    it('names the roles in declaration order and as a zod enum', () => {
        expect(roles.names).toEqual(['member', 'admin', 'owner']);
        expect(roles.schema.options).toEqual(['member', 'admin', 'owner']);
        expect(isRoles(roles)).toBe(true);
        expect(roles.permissions).toBe(permissions);
    });

    it('expands a role to what it holds, and all to everything', () => {
        expect(roles.of('member')).toEqual(['workspace:read', 'project:read']);
        expect(roles.of('owner')).toEqual(permissions.names);
    });

    it('unions several roles', () => {
        expect(roles.of(['member', 'admin'])).toEqual([
            'workspace:read',
            'project:read',
            'workspace:update',
            'project:create',
            'project:delete',
        ]);
    });

    it('answers whether a role holds every permission required', () => {
        expect(
            roles.holds('admin', {
                project: ['delete'],
            })
        ).toBe(true);
        expect(
            roles.holds('admin', {
                workspace: ['delete'],
            })
        ).toBe(false);
        expect(
            roles.holds(['member', 'admin'], {
                workspace: ['read', 'update'],
                project: ['delete'],
            })
        ).toBe(true);
        expect(roles.holds('member', {})).toBe(true);
    });

    it('rejects a role naming a permission the catalog does not declare', () => {
        expect(() =>
            Kizuna.roles(permissions, {
                viewer: {
                    // @ts-expect-error archive is not a workspace permission
                    workspace: ['archive'],
                },
            })
        ).toThrow(/workspace:archive/);
        expect(() =>
            Kizuna.roles(permissions, {
                viewer: {
                    // @ts-expect-error invoice is not in the catalog
                    invoice: ['read'],
                },
            })
        ).toThrow(/'invoice'/);
    });

    it('rejects an unknown role name at lookup', () => {
        expect(() => roles.of('viewer' as 'member')).toThrow(/not one of the roles declared/);
    });

    it('rejects an empty role set', () => {
        expect(() => Kizuna.roles(permissions, {})).toThrow(/at least one role/);
    });
});

describe('Kizuna.roles from names', () => {
    const plain = Kizuna.roles(['viewer', 'editor']);

    it('names the roles and carries no catalog', () => {
        expect(plain.names).toEqual(['viewer', 'editor']);
        expect(plain.schema.options).toEqual(['viewer', 'editor']);
        expect(plain.permissions).toBeUndefined();
        expect(plain.definitions).toBeUndefined();
        expect(isRoles(plain)).toBe(true);
    });

    it('holds nothing', () => {
        expect(plain.of('viewer')).toEqual([]);
        expect(plain.of(['viewer', 'editor'])).toEqual([]);
    });

    it('rejects an unknown role name at lookup', () => {
        expect(() => plain.of('owner' as 'viewer')).toThrow(/not one of the roles declared/);
    });

    it('rejects an empty list', () => {
        expect(() => Kizuna.roles([])).toThrow(/at least one role/);
    });
});
