import type { User } from './types';

const users = new Map<string, User>([
    ['1', { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', last_name: 'Lovelace' }],
    ['2', { id: '2', name: 'Linus Torvalds', email: 'linus@example.com' }],
]);

const archivedUsers = new Set<string>();

const sessions = new Map<string, { userId: string }>([
    ['tok_ada', { userId: '1' }],
    ['tok_linus', { userId: '2' }],
]);

type SessionEvent =
    | { kind: 'login'; at: string; ipAddress: string; userAgent: string }
    | { kind: 'logout'; at: string; reason: 'signed_out' | 'session_expired' };

const lastSessionEvents = new Map<string, SessionEvent>([
    ['1', { kind: 'login', at: '2026-08-04T10:00:00.000Z', ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0' }],
    ['2', { kind: 'logout', at: '2026-08-03T18:42:11.000Z', reason: 'session_expired' }],
]);

const workspaces = new Map<string, { id: string; name: string }>([['ws_1', { id: 'ws_1', name: 'Kizuna demo workspace' }]]);

const memberships = new Map<string, { workspaceUserId: string; workspaceId: string; role: 'owner' | 'admin' }>([
    ['wst_owner', { workspaceUserId: '1', workspaceId: 'ws_1', role: 'owner' }],
    ['wst_admin', { workspaceUserId: '2', workspaceId: 'ws_1', role: 'admin' }],
]);

export interface Invite {
    id: string;
    email: string;
    sentBy: string;
}

const invites = new Map<string, Invite>([['inv_9x2k7q', { id: 'invite_1', email: 'grace@example.com', sentBy: '2' }]]);

/**
 * In-memory stand-in for a real data layer, async to mimic a database.
 */
export const db = {
    users: {
        findMany: async ({ skip = 0, take = 20 }: { skip?: number; take?: number } = {}): Promise<User[]> =>
            Array.from(users.values()).slice(skip, skip + take),
        count: async (): Promise<number> => users.size,
        findById: async (id: string): Promise<User | null> => users.get(id) ?? null,
        findByEmail: async (email: string): Promise<User | null> => Array.from(users.values()).find((user) => user.email === email) ?? null,
        search: async (
            query: string,
            { cursor = 0, limit = 20 }: { cursor?: number; limit?: number } = {}
        ): Promise<{ users: User[]; nextCursor: number | null }> => {
            const matches = Array.from(users.values()).filter((user) => user.name.toLowerCase().includes(query.toLowerCase()));
            const page = matches.slice(cursor, cursor + limit);
            return {
                users: page,
                nextCursor: cursor + page.length < matches.length ? cursor + page.length : null,
            };
        },
        create: async (user: User): Promise<User> => {
            users.set(user.id, user);
            return user;
        },
        delete: async (id: string): Promise<boolean> => users.delete(id),
        archive: async (id: string): Promise<{ alreadyArchived: boolean }> => {
            const alreadyArchived = archivedUsers.has(id);
            archivedUsers.add(id);
            return {
                alreadyArchived,
            };
        },
    },
    sessions: {
        findByToken: async (token: string): Promise<{ userId: string } | null> => sessions.get(token) ?? null,
        findLastEventByUserId: async (userId: string): Promise<SessionEvent | null> => lastSessionEvents.get(userId) ?? null,
    },
    memberships: {
        findByApiKey: async (apiKey: string): Promise<{ workspaceUserId: string; workspaceId: string; role: 'owner' | 'admin' } | null> =>
            memberships.get(apiKey) ?? null,
    },
    workspaces: {
        findById: async (id: string): Promise<{ id: string; name: string } | null> => workspaces.get(id) ?? null,
        delete: async (id: string): Promise<boolean> => workspaces.delete(id),
    },
    invites: {
        findByToken: async (token: string): Promise<Invite | null> => invites.get(token) ?? null,
        findById: async (id: string): Promise<Invite | null> => Array.from(invites.values()).find((invite) => invite.id === id) ?? null,
        cancel: async (id: string): Promise<void> => {
            for (const [token, invite] of invites) {
                if (invite.id === id) invites.delete(token);
            }
        },
    },
};
