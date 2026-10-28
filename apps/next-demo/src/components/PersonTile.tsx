import type { Output } from '@kizunajs/cms';
import type { Employees } from '../cms/content';
import { sizedImage } from '../lib/image';
import styles from './PersonTile.module.css';

/**
 * Someone on the team: a portrait, then their name, role and how to reach
 * them. `compact` sets a small portrait beside the name.
 */
export function PersonTile({ employee, compact = false }: { employee: Output<typeof Employees>; compact?: boolean }) {
    const [width, height] = compact ? [160, 200] : [640, 800];
    return (
        <article className={compact ? styles.compact : styles.tile}>
            {employee.photo === undefined ? (
                <div className={styles.placeholder} aria-hidden="true" />
            ) : (
                <img
                    className={styles.photo}
                    src={sizedImage(employee.photo.url, width, height)}
                    alt={employee.photo.alt}
                    width={width}
                    height={height}
                    loading="lazy"
                />
            )}
            <div className={styles.text}>
                <h3 className={styles.name}>{employee.name}</h3>
                <p className={styles.role}>{employee.role}</p>
                {compact || employee.favouritePlant === undefined ? null : (
                    <p className={styles.favourite}>
                        Favourite: <em>{employee.favouritePlant}</em>
                    </p>
                )}
                {compact || employee.bio === undefined ? null : <p className={styles.bio}>{employee.bio}</p>}
                {employee.email === undefined && employee.phone === undefined ? null : (
                    <p className={styles.contact}>
                        {employee.email === undefined ? null : <a href={`mailto:${employee.email}`}>{employee.email}</a>}
                        {employee.phone === undefined ? null : (
                            <a href={`tel:${employee.phone.replace(/[^+\d]/g, '')}`}>{employee.phone}</a>
                        )}
                    </p>
                )}
            </div>
        </article>
    );
}
