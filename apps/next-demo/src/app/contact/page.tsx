import { cms } from '../../cms';
import { sendContactMessage } from './actions';

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
    const { sent } = await searchParams;
    const content = await cms.pages.contactPage.get();

    return (
        <main
            style={{
                padding: '2rem',
                maxWidth: '32rem',
                margin: '0 auto',
            }}>
            <h1>{content.heading}</h1>
            <p>{content.intro}</p>
            {sent === '1' ? (
                <p role="status">{content.thanks}</p>
            ) : (
                <form
                    action={sendContactMessage}
                    style={{
                        display: 'grid',
                        gap: '0.75rem',
                    }}>
                    <input name="name" placeholder="Name" required />
                    <input name="email" type="email" placeholder="Email" required />
                    <textarea name="message" placeholder="Message" rows={5} required />
                    <button type="submit">{content.buttonLabel}</button>
                </form>
            )}
        </main>
    );
}
