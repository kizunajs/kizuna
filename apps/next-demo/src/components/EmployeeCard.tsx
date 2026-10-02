import type { Output } from '@kizunajs/cms';
import type { Employees } from '../cms/content';

export function EmployeeCard({ employee }: { employee: Output<typeof Employees> }) {
    return (
        <article
            style={{
                display: 'grid',
                gap: '0.25rem',
                padding: '1rem',
                border: '1px solid #e5e5e5',
                borderRadius: '0.75rem',
            }}>
            {employee.photo !== undefined ? (
                <img
                    src={employee.photo.url}
                    alt={employee.photo.alt}
                    width={employee.photo.width}
                    height={employee.photo.height}
                    style={{
                        width: '4rem',
                        height: '4rem',
                        objectFit: 'cover',
                        borderRadius: '999px',
                    }}
                />
            ) : null}
            <strong>{employee.name}</strong>
            <span
                style={{
                    color: '#555',
                }}>
                {employee.role}
            </span>
            {employee.bio !== undefined ? (
                <p
                    style={{
                        margin: '0.5rem 0 0',
                        color: '#555',
                        fontSize: '0.9rem',
                    }}>
                    {employee.bio}
                </p>
            ) : null}
            {employee.email !== undefined ? <a href={`mailto:${employee.email}`}>{employee.email}</a> : null}
        </article>
    );
}
