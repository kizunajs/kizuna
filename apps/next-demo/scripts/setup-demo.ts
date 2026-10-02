import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { DocumentStore } from '@kizunajs/cms';
import { db } from '../src/db';
import { auth } from '../src/auth';
import { AUTH_TABLES_SQL, user } from '../src/auth/schema';

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
 * Creates the auth and CMS tables when they are missing, and the two demo
 * accounts. Safe to run on every start. A real app runs the migrations
 * `kizuna cms migrate` and better-auth's CLI write instead.
 */
const main = async (): Promise<void> => {
    for (const statement of AUTH_TABLES_SQL.split(';')) {
        await db.execute(sql.raw(statement));
    }
    const [found] = (await db.execute(sql`select to_regclass('cms_documents') as name`)) as unknown as Array<{ name: string | null }>;
    if (found?.name === null || found?.name === undefined) {
        await new DocumentStore(db).createTables();
        console.log('[demo] created the cms_ tables');
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
};

main().then(
    () => process.exit(0),
    (error) => {
        console.error(error);
        process.exit(1);
    }
);
