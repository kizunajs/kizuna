import { eq, sql } from 'drizzle-orm';
import { pluginExportsOf } from 'kizunajs/adapter';
import { indexSql, type CmsExports } from '@kizunajs/cms';
import kizuna from '../kizuna.cms.config';
import { db } from '../src/db';
import { auth } from '../src/auth';
import { AUTH_TABLES_SQL, user } from '../src/auth/schema';
import { seedContent } from './seed';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'kizuna-demo';

/**
 * The demo's editors. Ada is an admin over the shared content and every site.
 * The others draft shared content, and work on their own site under the role
 * `sites` gives them.
 */
const people: {
    email: string;
    name: string;
    role: string;
    sites: Record<string, string>;
    password?: string;
}[] = [
    {
        email: 'dev@kizunajs.com',
        name: 'Kizuna Dev',
        role: 'admin',
        sites: {},
        password: 'password1234',
    },
    {
        email: 'ada@hagen.example.com',
        name: 'Ada Lund',
        role: 'admin',
        sites: {},
    },
    {
        email: 'una@hagen.example.com',
        name: 'Una Patel',
        role: 'editor',
        sites: {
            uk: 'admin',
        },
    },
    {
        email: 'sam@hagen.example.com',
        name: 'Sam Brooks',
        role: 'editor',
        sites: {
            uk: 'editor',
        },
    },
    {
        email: 'nils@hagen.example.com',
        name: 'Nils Aas',
        role: 'editor',
        sites: {
            norway: 'admin',
        },
    },
    {
        email: 'kari@hagen.example.com',
        name: 'Kari Nordmann',
        role: 'editor',
        sites: {
            norway: 'editor',
        },
    },
];

/**
 * Creates the auth and CMS tables and indexes when they are missing, the
 * demo accounts, and the seed content. Safe to run on every start. A real app
 * runs the migrations `kizuna cms migrate` and better-auth's CLI write instead.
 */
const main = async (): Promise<void> => {
    const { service } = pluginExportsOf(kizuna.api)['cms'] as CmsExports;
    for (const statement of AUTH_TABLES_SQL.split(';')) {
        await db.execute(sql.raw(statement));
    }
    await db.execute(sql`alter table auth_user add column if not exists sites text not null default '{}'`);
    await service.store.createTables();
    for (const statement of indexSql(service.indexedFields()).split('\n')) {
        if (statement !== '') await db.execute(sql.raw(statement));
    }
    for (const person of people) {
        const [existing] = await db.select().from(user).where(eq(user.email, person.email));
        if (existing === undefined) {
            await auth.api.signUpEmail({
                body: {
                    email: person.email,
                    name: person.name,
                    password: person.password ?? PASSWORD,
                },
            });
            console.log(`[demo] created ${person.email} with password ${person.password ?? PASSWORD}`);
        }
        await db
            .update(user)
            .set({
                role: person.role,
                sites: JSON.stringify(person.sites),
            })
            .where(eq(user.email, person.email));
    }
    await seedContent(service);
};

main().then(
    () => process.exit(0),
    (error) => {
        console.error(error);
        process.exit(1);
    }
);
