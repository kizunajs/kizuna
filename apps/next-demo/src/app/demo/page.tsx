import type { Metadata } from 'next';
import { apiClient } from '../../lib/api-client';
import { createUserAction, deleteUserAction } from './actions';
import panel from '../../components/Panel.module.css';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'API demo',
};

export default async function ApiDemoPage() {
    const result = await apiClient.users.listUsers({
        query: {
            page: 1,
            limit: 50,
        },
    });
    const users = result.status === 200 ? result.body.users : [];

    return (
        <main className={`${panel.page} ${styles.page}`}>
            <div className={panel.card}>
                <h1 className={panel.title}>API demo</h1>
                <p className={panel.lead}>
                    The same shared routes power the Express and Next.js demos. This page is a server component calling them through the
                    typed client.
                </p>
                <ul className={styles.links}>
                    <li>
                        <a href="http://localhost:8000/users" target="_blank" rel="noreferrer">
                            Express API (:8000/users)
                        </a>
                    </li>
                    <li>
                        <a href="/api/users" target="_blank" rel="noreferrer">
                            Next.js API (:3030/api/users)
                        </a>
                    </li>
                    <li>
                        <a href="http://localhost:8000/" target="_blank" rel="noreferrer">
                            Express demo page (:8000)
                        </a>
                    </li>
                    <li>
                        <a href="/admin">Admin (sign in)</a>
                    </li>
                    <li>
                        <a href="/">Shop home</a>
                    </li>
                </ul>

                <h2 className={styles.heading}>Users</h2>
                <form action={createUserAction} className={styles.addForm}>
                    <input name="name" placeholder="Name" aria-label="Name" required className={panel.input} />
                    <input name="email" type="email" placeholder="Email" aria-label="Email" required className={panel.input} />
                    <button type="submit" className={panel.primary}>
                        Add user
                    </button>
                </form>

                <ul className={styles.users}>
                    {users.map((user) => (
                        <li key={user.id} className={styles.user}>
                            <span>
                                {user.name} <span className={styles.email}>{user.email}</span>
                            </span>
                            <form action={deleteUserAction}>
                                <input type="hidden" name="id" value={user.id} />
                                <button type="submit" className={panel.secondary}>
                                    Delete
                                </button>
                            </form>
                        </li>
                    ))}
                    {users.length === 0 && <li className={styles.email}>No users yet.</li>}
                </ul>
            </div>
        </main>
    );
}
