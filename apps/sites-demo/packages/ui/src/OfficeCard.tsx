import { CmsImage, type Image } from './Image';
import styles from './OfficeCard.module.css';

export interface Office {
    name: string;
    city: string;
    address: string;
    phone: string;
    openingHours?: string | undefined;
    photo?: Image | undefined;
}

/**
 * One shop: its city, where it is, and how to reach it.
 */
export function OfficeCard({ office }: { office: Office }) {
    return (
        <section className={styles.office}>
            <p className={styles.city}>{office.city}</p>
            <h2 className={styles.name}>{office.name}</h2>
            <div className={styles.details}>
                <p>{office.address}</p>
                {office.openingHours === undefined ? null : <p>{office.openingHours}</p>}
                <a className={styles.phone} href={`tel:${office.phone.replace(/\s/g, '')}`}>
                    {office.phone}
                </a>
            </div>
            {office.photo === undefined ? null : <CmsImage className={styles.photo} image={office.photo} width={360} height={240} />}
        </section>
    );
}
