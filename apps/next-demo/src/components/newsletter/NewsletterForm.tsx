'use client';

import { useActionState } from 'react';
import { subscribe } from './actions';
import styles from './NewsletterForm.module.css';

/**
 * An email on an underline and a round arrow to send it.
 */
export function NewsletterForm() {
    const [state, action, pending] = useActionState(subscribe, {
        subscribed: false,
    });

    if (state.subscribed) {
        return (
            <p role="status" className={styles.thanks}>
                Thank you. The next letter goes out on the first Sunday of the month.
            </p>
        );
    }

    return (
        <form action={action} className={styles.form}>
            <label className={styles.field}>
                <span className={styles.label}>Email address</span>
                <input name="email" type="email" required placeholder="you@example.no" autoComplete="email" className={styles.input} />
            </label>
            <button type="submit" className={styles.submit} disabled={pending} aria-label="Subscribe">
                <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.arrow}>
                    <path d="M4 10h11M11 5.5 15.5 10 11 14.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
        </form>
    );
}
