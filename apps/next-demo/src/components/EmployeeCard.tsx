import type { Output } from '@kizunajs/cms';
import type { Employees } from '../cms/content';
import { sizedImage } from '../lib/image';
import styles from './EmployeeCard.module.css';

const SIZE = 160;

export function EmployeeCard({ employee }: { employee: Output<typeof Employees> }) {
    return (
        <article className={styles.card}>
            {employee.photo !== undefined ? (
                <img
                    className={styles.photo}
                    src={sizedImage(employee.photo.url, SIZE, SIZE)}
                    alt={employee.photo.alt}
                    width={SIZE}
                    height={SIZE}
                />
            ) : (
                <div className={styles.photo} aria-hidden="true" />
            )}
            <div>
                <h3 className={styles.name}>{employee.name}</h3>
                <p className={styles.role}>{employee.role}</p>
            </div>
            {employee.bio !== undefined ? <p className={styles.bio}>{employee.bio}</p> : null}
            {employee.email !== undefined || employee.phone !== undefined ? (
                <p className={styles.contact}>
                    {employee.email !== undefined ? <a href={`mailto:${employee.email}`}>{employee.email}</a> : null}
                    {employee.phone !== undefined ? <span>{employee.phone}</span> : null}
                </p>
            ) : null}
        </article>
    );
}
