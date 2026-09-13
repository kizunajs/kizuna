## BREAKING CHANGES

### `k.auth` is now `k.accessControl`

**Before**

```ts
export const auth = k.auth(routes, { ... });
```

**After**

```ts
export const accessControl = k.accessControl(routes, { ... });
```

`k.contract` takes it under `accessControl`.

### An identity takes `roles`

**Before**

```ts
access: z.object({
    role: z.enum(['owner', 'admin']),
}),
```

**After**

```ts
roles,
```

### A route names the roles it accepts

**Before**

```ts
deleteWorkspace: {
    member: {
        role: 'owner',
    },
},
```

**After**

```ts
deleteWorkspace: {
    auth: 'member',
    roles: 'owner',
},
```

### OAuth scopes are permissions

**Before**

```ts
createUser: {
    user: ['users:write'],
},
```

**After**

```ts
createUser: {
    auth: 'user',
    requires: {
        users: ['write'],
    },
},
```

The guard no longer receives `scopes`. It returns the token's scopes as `permissions`, and kizuna answers `insufficient_scope` itself. An OAuth identity takes `resourceMetadata`, the URL of the discovery document, and every `Bearer` challenge carries it:

```ts
Kizuna.identity.oauth2({
    flows,
    resourceMetadata: 'https://api.example.com/.well-known/oauth-protected-resource',
    roles,
});
```

## What this PR also adds

```ts title="contract/roles.ts"
export const roles = Kizuna.roles(['admin', 'owner']);
```

kizuna checks the caller's role against the route before the handler runs, and the handler reads it under `auth.member.role`.

A route can name the permission it requires instead of the role. Declare the permissions, build the roles from them, and the map says what a route needs:

```ts title="contract/permissions.ts"
export const permissions = Kizuna.permissions({
    workspace: ['read', 'delete'],
});
```

```ts title="contract/roles.ts"
export const roles = Kizuna.roles(permissions, {
    admin: {
        workspace: ['read'],
    },
    owner: 'all',
});
```

```ts title="contract/access-control.ts"
deleteWorkspace: {
    auth: 'member',
    requires: {
        workspace: ['delete'],
    },
},
```

Changing what a role holds is one edit in `roles.ts`, and every route follows. The handler reads what the caller holds under `auth.member.permissions`.

A guard may return `permissions` beside the role, the subset of the role's permissions this member was given.
