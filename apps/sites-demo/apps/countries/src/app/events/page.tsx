import { notFound } from 'next/navigation';
import kizuna from '@kizunajs-demo/sites-content/config';
import { EventList } from '@kizunajs-demo/sites-ui';

export const metadata = {
    title: 'Events',
};

export default async function EventsPage() {
    const content = kizuna.content.of(['uk', 'norway']);
    if (content.site !== 'uk') notFound();
    const page = await content.pages.eventsPage.get();
    const { items: events } = await content.collections.events.list({
        orderBy: 'date',
        direction: 'asc',
    });
    return (
        <main>
            <h1>{page.heading}</h1>
            {page.intro === undefined ? null : <p>{page.intro}</p>}
            <EventList events={events} />
        </main>
    );
}
