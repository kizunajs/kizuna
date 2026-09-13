import { expectTypeOf, test } from 'vitest';
import { Kizuna } from './kizuna.js';
import type { PermissionName, RoleNamesOf } from './permissions.js';

const permissions = Kizuna.permissions({
    workspace: ['read', 'delete'],
    project: ['create', 'read'],
});

const roles = Kizuna.roles(permissions, {
    member: {
        project: ['read'],
    },
    owner: 'all',
});

test('permission names are the resource:verb literals of the catalog', () => {
    expectTypeOf<PermissionName<typeof permissions.catalog>>().toEqualTypeOf<
        'workspace:read' | 'workspace:delete' | 'project:create' | 'project:read'
    >();
    expectTypeOf(permissions.names).toEqualTypeOf<readonly ('workspace:read' | 'workspace:delete' | 'project:create' | 'project:read')[]>();
});

test('role names are the keys declared', () => {
    expectTypeOf<RoleNamesOf<typeof roles>>().toEqualTypeOf<'member' | 'owner'>();
    expectTypeOf(roles.names).toEqualTypeOf<readonly ('member' | 'owner')[]>();
});

test('a role rejects a permission outside the catalog', () => {
    Kizuna.roles(permissions, {
        viewer: {
            // @ts-expect-error archive is not a workspace permission
            workspace: ['archive'],
        },
    });
    Kizuna.roles(permissions, {
        viewer: {
            // @ts-expect-error invoice is not in the catalog
            invoice: ['read'],
        },
    });
});

test('of and holds accept one role or several, and nothing else', () => {
    roles.of('member');
    roles.of(['member', 'owner']);
    // @ts-expect-error viewer is not a declared role
    roles.of('viewer');
    roles.holds('owner', {
        project: ['create'],
    });
    roles.holds('owner', {
        // @ts-expect-error share is not a project permission
        project: ['share'],
    });
});

test('roles from names carry no catalog', () => {
    const plain = Kizuna.roles(['viewer', 'editor']);
    expectTypeOf<RoleNamesOf<typeof plain>>().toEqualTypeOf<'viewer' | 'editor'>();
    expectTypeOf(plain.permissions).toEqualTypeOf<undefined>();
    expectTypeOf(plain.of('viewer')).toEqualTypeOf<never[]>();
    // @ts-expect-error owner is not a declared role
    plain.of('owner');
});
