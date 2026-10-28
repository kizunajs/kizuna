import type { Metadata } from 'next';
import { signIn } from './actions';
import panel from '../../components/Panel.module.css';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Sign in',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
    const { error, next } = await searchParams;

    return (
        <main className={`${panel.page} ${styles.page}`}>
            <div className={panel.card}>
                <h1 className={panel.title}>Sign in</h1>
                <p className={panel.lead}>
                    dev@kizunajs.com, password password1234. Or editor@example.com and admin@example.com, password kizuna-demo.
                </p>
                {error !== undefined ? (
                    <p role="alert" className={panel.alert}>
                        That email and password did not match.
                    </p>
                ) : null}
                <form action={signIn} className={panel.form}>
                    <input type="hidden" name="next" value={next ?? '/admin'} />
                    <input
                        name="email"
                        type="email"
                        placeholder="Email"
                        aria-label="Email"
                        autoComplete="username"
                        defaultValue="dev@kizunajs.com"
                        required
                        className={panel.input}
                    />
                    <input
                        name="password"
                        type="password"
                        placeholder="Password"
                        aria-label="Password"
                        autoComplete="current-password"
                        required
                        className={panel.input}
                    />
                    <button type="submit" className={panel.primary}>
                        Sign in
                    </button>
                </form>
            </div>
        </main>
    );
}
