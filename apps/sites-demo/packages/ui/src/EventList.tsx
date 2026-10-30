export interface Event {
    id: string;
    title: string;
    summary: string;
    date: string;
    time: string;
    price?: string | undefined;
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
});

/**
 * Workshops in date order, each with its day, time and price.
 */
export function EventList({ events }: { events: Event[] }) {
    return (
        <ol>
            {events.map((event) => (
                <li key={event.id}>
                    <h2>{event.title}</h2>
                    <p>
                        {dateFormat.format(new Date(event.date))}, {event.time}
                        {event.price === undefined ? null : `, ${event.price}`}
                    </p>
                    <p>{event.summary}</p>
                </li>
            ))}
        </ol>
    );
}
