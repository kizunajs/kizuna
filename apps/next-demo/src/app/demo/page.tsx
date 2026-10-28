import type { Metadata } from 'next';
import { apiClient } from '../../lib/api-client';
import { createUserAction, deleteUserAction } from './actions';
import { Eyebrow } from '../../components/Eyebrow';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'API demo',
};

const links = [
    {
        label: 'Express API, :8000/users',
        href: 'http://localhost:8000/users',
    },
    {
        label: 'Next.js API, /api/users',
        href: '/api/users',
    },
    {
        label: 'Express demo page, :8000',
        href: 'http://localhost:8000/',
    },
    {
        label: 'API reference',
        href: '/api/docs',
    },
];

export default async function ApiDemoPage() {
    const result = await apiClient.users.listUsers({
        query: {
            page: 1,
            limit: 50,
        },
    });
    const users = result.status === 200 ? result.body.users : [];

    return (
        <main className={styles.page}>
            <Eyebrow text="Kizuna" />
            <h1 className={styles.title}>
                The <em>API</em> behind the shop
            </h1>
            <p className={styles.lead}>
                The Express and Next.js demos share these routes. This page is a server component calling them through the typed client.
            </p>
            <ul className={styles.links}>
                {links.map((link) => (
                    <li key={link.href}>
                        <a href={link.href} target="_blank" rel="noreferrer">
                            {link.label}
                        </a>
                    </li>
                ))}
            </ul>

            <h2 className={styles.heading}>Users</h2>
            <form action={createUserAction} className={styles.addForm}>
                <label className={styles.field}>
                    <span className={styles.label}>Name</span>
                    <input name="name" required className={styles.input} />
                </label>
                <label className={styles.field}>
                    <span className={styles.label}>Email</span>
                    <input name="email" type="email" required className={styles.input} />
                </label>
                <button type="submit" className={styles.add}>
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
                            <button type="submit" className={styles.delete}>
                                Delete
                            </button>
                        </form>
                    </li>
                ))}
                {users.length === 0 ? <li className={styles.email}>No users yet.</li> : null}
            </ul>
        </main>
    );
}
