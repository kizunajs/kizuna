import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import { signOut } from '../login/actions';
import panel from '../../components/Panel.module.css';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Edit in your chat',
};

export default async function ChatEditingPage() {
    const found = await auth.api.getSession({
        headers: await headers(),
    });
    if (found === null) redirect('/login?next=/cms');
    const origin = process.env.BETTER_AUTH_URL ?? 'http://localhost:3030';

    return (
        <main className={`${panel.page} ${styles.page}`}>
            <div className={styles.account}>
                <span>
                    Signed in as <strong>{found.user.name}</strong>, {String(found.user.role)}
                </span>
                <form action={signOut}>
                    <button type="submit" className={panel.secondary}>
                        Sign out
                    </button>
                </form>
            </div>
            <div className={panel.card}>
                <h1 className={panel.title}>Edit in your chat</h1>
                <p className={panel.lead}>
                    Add the MCP server below to Claude, or another host that shows MCP Apps, with your session as the bearer. Ask it to
                    change a page, and the editor opens beside the answer. It edits as you, with your role.
                </p>
                <pre className={styles.command}>
                    {`claude mcp add --transport http kizuna-demo ${origin}/cms-api/mcp --header "Authorization: Bearer ${found.session.token}"`}
                </pre>
                <p className={styles.admin}>
                    Or edit in the browser, in the <a href="/admin">admin</a>.
                </p>
            </div>
        </main>
    );
}
