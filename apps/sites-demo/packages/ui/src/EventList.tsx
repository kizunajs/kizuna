import { CmsImage, type Image } from './Image';
import styles from './EventList.module.css';

export interface Event {
    id: string;
    title: string;
    summary: string;
    date: string;
    time: string;
    price?: string | undefined;
    image?: Image | undefined;
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
});

/**
 * Workshops in date order, each with its day, time and price.
 */
export function EventList({ events }: { events: Event[] }) {
    return (
        <ol className={styles.list}>
            {events.map((event) => (
                <li key={event.id} className={styles.event}>
                    <p className={styles.when}>
                        <span className={styles.day}>{dateFormat.format(new Date(event.date))}</span>
                        <span>{event.time}</span>
                        {event.price === undefined ? null : <span>{event.price}</span>}
                    </p>
                    <div className={styles.body}>
                        {event.image === undefined ? null : (
                            <CmsImage className={styles.image} image={event.image} width={480} height={300} />
                        )}
                        <h2 className={styles.title}>{event.title}</h2>
                        <p className={styles.summary}>{event.summary}</p>
                    </div>
                </li>
            ))}
        </ol>
    );
}
