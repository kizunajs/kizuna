import type { Metadata } from 'next';
import kizuna from '@kizuna-config';
import { departments } from '../../cms/content';
import { EmployeeCard } from '../../components/EmployeeCard';

export const metadata: Metadata = {
    title: 'Team',
};

export default async function TeamPage() {
    const content = await kizuna.content.pages.teamPage.get();
    const { items } = await kizuna.content.collections.employees.list({
        orderBy: 'order',
        direction: 'asc',
        limit: 100,
    });
    const shown = [...new Set(items.map((employee) => employee.department))];

    return (
        <main
            style={{
                padding: '2rem',
                maxWidth: '56rem',
                margin: '0 auto',
            }}>
            <h1>{content.heading}</h1>
            <p
                style={{
                    color: '#555',
                }}>
                {content.intro}
            </p>
            {content.photo !== undefined ? (
                <img
                    src={content.photo.url}
                    alt={content.photo.alt}
                    width={content.photo.width}
                    height={content.photo.height}
                    style={{
                        width: '100%',
                        height: 'auto',
                        borderRadius: '0.75rem',
                    }}
                />
            ) : null}
            {shown.map((department) => (
                <section key={department}>
                    <h2>{departments[department]}</h2>
                    <ul
                        style={{
                            listStyle: 'none',
                            padding: 0,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))',
                            gap: '1rem',
                        }}>
                        {items
                            .filter((employee) => employee.department === department)
                            .map((employee) => (
                                <li key={employee.id}>
                                    <EmployeeCard employee={employee} />
                                </li>
                            ))}
                    </ul>
                </section>
            ))}
        </main>
    );
}
