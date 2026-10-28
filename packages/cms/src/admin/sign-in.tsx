import { useState } from 'react';
import { Button } from '@base-ui/react/button';
import { Field } from '@base-ui/react/field';
import { Form } from '@base-ui/react/form';
import { Logo } from '../view/logo.js';
import type { SignInConfig } from './sign-in-config.js';

const NO_ACCESS = 'This account cannot edit. Sign in as an editor.';

/**
 * What the screen says when the sign-in route turns the editor away. A wrong
 * email reads the same as a wrong password.
 */
const messageFor = (status: number): string => {
    if (status === 401) return 'Wrong email or password.';
    if (status === 403) return 'Open this page again from the admin and retry.';
    return 'Signing in failed. Try again.';
};

/**
 * The admin's sign-in screen: an email, a password and a Sign in button,
 * sent to the CMS's sign-in route. Once the editor is in, the page goes on
 * to `next`.
 */
export function SignIn({ config }: { config: SignInConfig }) {
    const [error, setError] = useState<string | null>(config.noAccess ? NO_ACCESS : null);
    const [pending, setPending] = useState(false);

    const signIn = async (values: { email: string; password: string }) => {
        setPending(true);
        setError(null);
        try {
            const response = await fetch(config.signInPath, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    email: values.email,
                    password: values.password,
                }),
            });
            if (response.ok) {
                window.location.assign(config.next);
                return;
            }
            setError(messageFor(response.status));
        } catch {
            setError('Could not reach the server. Try again.');
        }
        setPending(false);
    };

    // While the server turns the editor away, both fields point at why.
    const refused =
        error === null
            ? {}
            : {
                  'aria-invalid': true,
                  'aria-describedby': 'k-sign-in__error',
              };

    return (
        <main className="k-sign-in">
            <Form
                className="k-sign-in__form"
                aria-labelledby="k-sign-in__title"
                onFormSubmit={(values: { email: string; password: string }) => void signIn(values)}>
                <Logo />
                <h1 id="k-sign-in__title" className="k-sign-in__title">
                    Sign in
                </h1>
                <Field.Root name="email" className="k-sign-in__field">
                    <Field.Label className="k-sign-in__label">Email</Field.Label>
                    <Field.Control className="k-input" type="email" autoComplete="username" required autoFocus {...refused} />
                    <Field.Error className="k-sign-in__hint" />
                </Field.Root>
                <Field.Root name="password" className="k-sign-in__field">
                    <Field.Label className="k-sign-in__label">Password</Field.Label>
                    <Field.Control className="k-input" type="password" autoComplete="current-password" required {...refused} />
                    <Field.Error className="k-sign-in__hint" />
                </Field.Root>
                <p id="k-sign-in__error" className="k-sign-in__error" role="alert">
                    {error}
                </p>
                <Button type="submit" className="k-button k-button--primary" disabled={pending}>
                    {pending ? 'Signing in…' : 'Sign in'}
                </Button>
            </Form>
        </main>
    );
}
