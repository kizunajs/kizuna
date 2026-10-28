import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import { signOut } from './actions';
import { Eyebrow } from '../../components/Eyebrow';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Edit in your chat',
};

export default async function ChatEditingPage() {
    const found = await auth.api.getSession({
        headers: await headers(),
    });
    if (found === null) redirect('/admin/login?next=/cms');
    const origin = process.env.BETTER_AUTH_URL ?? 'http://localhost:3030';

    return (
        <main className={styles.page}>
            <div className={styles.account}>
                <span>
                    Signed in as <strong>{found.user.name}</strong>, {String(found.user.role)}
                </span>
                <form action={signOut}>
                    <button type="submit" className={styles.signOut}>
                        Sign out
                    </button>
                </form>
            </div>
            <Eyebrow text="MCP" />
            <h1 className={styles.title}>
                Edit this site <em>in your chat</em>
            </h1>
            <p className={styles.lead}>
                Add the MCP server below to Claude, or another host that shows MCP Apps, with your session as the bearer. Ask it to change a
                page, and the editor opens beside the answer. It edits as you, with your role.
            </p>
            <h2 className={styles.label}>Run this in a terminal</h2>
            <pre className={styles.command}>
                {`claude mcp add --transport http kizuna-demo ${origin}/cms-api/mcp --header "Authorization: Bearer ${found.session.token}"`}
            </pre>
            <p className={styles.admin}>
                Prefer the browser? <a href="/admin">Open the admin</a>
            </p>
        </main>
    );
}
