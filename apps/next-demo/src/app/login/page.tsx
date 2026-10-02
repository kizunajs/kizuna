import { signIn } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
    const { error, next } = await searchParams;

    return (
        <main
            style={{
                padding: '2rem',
                maxWidth: '22rem',
                margin: '4rem auto',
            }}>
            <h1>Sign in</h1>
            <p
                style={{
                    color: '#555',
                }}>
                editor@example.com or admin@example.com, password kizuna-demo.
            </p>
            {error !== undefined ? <p role="alert">That email and password did not match.</p> : null}
            <form
                action={signIn}
                style={{
                    display: 'grid',
                    gap: '0.75rem',
                }}>
                <input type="hidden" name="next" value={next ?? '/cms'} />
                <input name="email" type="email" placeholder="Email" defaultValue="editor@example.com" required />
                <input name="password" type="password" placeholder="Password" required />
                <button type="submit">Sign in</button>
            </form>
        </main>
    );
}
