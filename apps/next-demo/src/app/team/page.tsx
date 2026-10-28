import type { Metadata } from 'next';
import kizuna from '@kizuna-config';
import { departments } from '../../cms/content';
import { Hero } from '../../components/blocks/Hero';
import { Section } from '../../components/Section';
import { EmployeeCard } from '../../components/EmployeeCard';
import styles from './page.module.css';

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
    const present = new Set<string>(items.map((employee) => employee.department));
    const shown = Object.entries(departments).filter(([department]) => present.has(department));

    return (
        <main>
            <Hero impact="medium" heading={content.heading} subheading={content.intro} image={content.photo} />
            {shown.map(([department, label]) => (
                <Section key={department} heading={label}>
                    <ul className={styles.grid}>
                        {items
                            .filter((employee) => employee.department === department)
                            .map((employee) => (
                                <li key={employee.id}>
                                    <EmployeeCard employee={employee} />
                                </li>
                            ))}
                    </ul>
                </Section>
            ))}
        </main>
    );
}
