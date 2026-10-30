import kizuna from '@kizunajs-demo/sites-content/config';
import { PageIntro } from '@kizunajs-demo/sites-ui';
import styles from './page.module.css';

export const metadata = {
    title: 'People',
};

export default async function TeamPage() {
    const { items: offices } = await kizuna.content.collections.offices.list({
        orderBy: 'order',
        direction: 'asc',
    });
    const { items: employees } = await kizuna.content.collections.employees.list({
        orderBy: 'order',
        direction: 'asc',
    });
    return (
        <main>
            <PageIntro eyebrow="People" heading="The people at Hagen" text="Six of us across three shops, sharing one plant care desk." />
            <div className={styles.offices}>
                {offices.map((office) => (
                    <section key={office.id} className={styles.office}>
                        <h2 className={styles.city}>{office.city}</h2>
                        <ul className={styles.people}>
                            {employees
                                .filter((employee) => employee.office === office.id)
                                .map((employee) => (
                                    <li key={employee.id} className={styles.person}>
                                        <h3 className={styles.name}>{employee.name}</h3>
                                        <p className={styles.role}>{employee.role}</p>
                                        {employee.bio === undefined ? null : <p className={styles.bio}>{employee.bio}</p>}
                                    </li>
                                ))}
                        </ul>
                    </section>
                ))}
            </div>
        </main>
    );
}
