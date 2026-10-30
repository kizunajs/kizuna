import { notFound } from 'next/navigation';
import kizuna from '@kizunajs-demo/sites-content/config';
import { EventList, PageIntro } from '@kizunajs-demo/sites-ui';

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
            <PageIntro eyebrow="Events" heading={page.heading} text={page.intro} />
            <EventList events={events} />
        </main>
    );
}
