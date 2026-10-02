import { eq, sql } from 'drizzle-orm';
import { pluginExportsOf } from 'kizunajs/adapter';
import { indexSql, type CmsExports } from '@kizunajs/cms';
import kizuna from '../kizuna.cms.config';
import { db } from '../src/db';
import { auth } from '../src/auth';
import { AUTH_TABLES_SQL, user } from '../src/auth/schema';
import { seedContent } from './seed-content';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'kizuna-demo';

const people = [
    {
        email: 'editor@example.com',
        name: 'Edda Editor',
        role: 'editor',
    },
    {
        email: 'admin@example.com',
        name: 'Ada Admin',
        role: 'admin',
    },
];

/**
 * Creates the auth and CMS tables and indexes when they are missing, the two
 * demo accounts, and the seed content. Safe to run on every start. A real app
 * runs the migrations `kizuna cms migrate` and better-auth's CLI write instead.
 */
const main = async (): Promise<void> => {
    const { service } = pluginExportsOf(kizuna.api)['cms'] as CmsExports;
    for (const statement of AUTH_TABLES_SQL.split(';')) {
        await db.execute(sql.raw(statement));
    }
    const [found] = (await db.execute(sql`select to_regclass('cms_documents') as name`)) as unknown as Array<{ name: string | null }>;
    if (found?.name === null || found?.name === undefined) {
        await service.store.createTables();
        console.log('[demo] created the cms_ tables');
    } else {
        // Demo databases made before the column existed.
        await db.execute(sql`alter table cms_documents add column if not exists published_at timestamptz`);
    }
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
                    password: PASSWORD,
                },
            });
            console.log(`[demo] created ${person.email} with password ${PASSWORD}`);
        }
        await db
            .update(user)
            .set({
                role: person.role,
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
