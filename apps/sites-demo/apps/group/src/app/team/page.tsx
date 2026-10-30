import kizuna from '@kizunajs-demo/sites-content/config';

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
            <h1>The people at Hagen</h1>
            {offices.map((office) => (
                <section key={office.id}>
                    <h2>{office.name}</h2>
                    <ul>
                        {employees
                            .filter((employee) => employee.office === office.id)
                            .map((employee) => (
                                <li key={employee.id}>
                                    <strong>{employee.name}</strong>, {employee.role}
                                </li>
                            ))}
                    </ul>
                </section>
            ))}
        </main>
    );
}
