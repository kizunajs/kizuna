import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { CmsOverview } from '@kizunajs/cms/next';
import kizuna from '../../../kizuna.cms.config';
import { auth } from '../../auth';
import { signOut } from '../login/actions';

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
    const found = await auth.api.getSession({
        headers: await headers(),
    });
    if (found === null) redirect('/login?next=/cms');
    const origin = process.env.BETTER_AUTH_URL ?? 'http://localhost:3030';

    return (
        <>
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    maxWidth: '64rem',
                    margin: '0 auto',
                    padding: '1rem',
                    fontFamily: 'system-ui, sans-serif',
                    borderBottom: '1px solid #e5e5e5',
                }}>
                <span>
                    {found.user.name} · {String(found.user.role)}
                </span>
                <form action={signOut}>
                    <button type="submit">Sign out</button>
                </form>
            </header>
            <CmsOverview api={kizuna.api} apiPath="/cms-api" />
            <section
                style={{
                    maxWidth: '64rem',
                    margin: '0 auto',
                    padding: '0 1rem 3rem',
                    fontFamily: 'system-ui, sans-serif',
                }}>
                <h2
                    style={{
                        fontSize: '1.1rem',
                    }}>
                    Connect an agent
                </h2>
                <p>Point an MCP client at the endpoint below with your session as the bearer. It edits as you, with your role.</p>
                <pre
                    style={{
                        background: '#f4f4f4',
                        padding: '0.75rem',
                        overflow: 'auto',
                        fontSize: '0.8rem',
                    }}>
                    {`claude mcp add --transport http kizuna-demo ${origin}/cms-api/mcp --header "Authorization: Bearer ${found.session.token}"`}
                </pre>
            </section>
        </>
    );
}
