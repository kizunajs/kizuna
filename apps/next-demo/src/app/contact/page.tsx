import kizuna from '@kizuna-config';
import { sendContactMessage } from './actions';
import { EmployeeCard } from '../../components/EmployeeCard';

export const metadata = {
    title: 'Contact us',
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
    const { sent } = await searchParams;

    const content = await kizuna.content.pages.contactPage.get();

    const contacts = await kizuna.content.collections.employees.getMany({
        ids: content.contacts,
    });

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
            {contacts.length > 0 ? (
                <section>
                    <h2>Talk to us directly</h2>
                    <div
                        style={{
                            display: 'grid',
                            gap: '1rem',
                        }}>
                        {contacts.map((employee) => (
                            <EmployeeCard key={employee.id} employee={employee} />
                        ))}
                    </div>
                </section>
            ) : null}
        </main>
    );
}
