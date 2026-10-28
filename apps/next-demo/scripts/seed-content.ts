import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatRef, type CmsService, type DocumentRef } from '@kizunajs/cms';
import { richTextFromPlain } from '@kizunajs/cms/schemas';

const AUTHOR = 'seed';
const PHOTOS = join(process.cwd(), 'seed/photos');

/**
 * Photos from Unsplash, free to use under the Unsplash License.
 */
const library = [
    {
        file: 'team-at-laptops.jpg',
        alt: 'Four people working at laptops around a wooden table',
        source: 'https://unsplash.com/photos/1522071820081-009f0129c71c',
    },
    {
        file: 'poppies.jpg',
        alt: 'Orange poppies against a blue sky',
        source: 'https://unsplash.com/photos/1490750967868-88aa4486c946',
    },
    {
        file: 'cherry-blossom.jpg',
        alt: 'Pink cherry blossom on a branch',
        source: 'https://unsplash.com/photos/1522383225653-ed111181a951',
    },
    {
        file: 'ferns.jpg',
        alt: 'Green fern leaves filling the frame',
        source: 'https://unsplash.com/photos/1497250681960-ef046c08a56e',
    },
    {
        file: 'forest-path.jpg',
        alt: 'A path through a sunlit forest',
        source: 'https://unsplash.com/photos/1441974231531-c6227db76b6e',
    },
    {
        file: 'office-corridor.jpg',
        alt: 'An empty office corridor with glass walls',
        source: 'https://unsplash.com/photos/1497366216548-37526070297c',
    },
];

const people = [
    {
        file: 'ingrid-solberg.jpg',
        source: 'https://unsplash.com/photos/1438761681033-6461ffad8d80',
        values: {
            name: 'Ingrid Solberg',
            role: 'Design lead',
            department: 'design',
            email: 'ingrid@example.com',
            bio: 'Ingrid decides how the shop looks, from the shelves in the shop to the care cards in every box.',
            order: 0,
        },
    },
    {
        file: 'aiko-tanaka.jpg',
        source: 'https://unsplash.com/photos/1534528741775-53994a69daeb',
        values: {
            name: 'Aiko Tanaka',
            role: 'Product designer',
            department: 'design',
            email: 'aiko@example.com',
            bio: 'Aiko designs the online shop and photographs every plant we sell.',
            order: 1,
        },
    },
    {
        file: 'daniel-moreau.jpg',
        source: 'https://unsplash.com/photos/1500648767791-00dcc994a43e',
        values: {
            name: 'Daniel Moreau',
            role: 'Staff engineer',
            department: 'engineering',
            email: 'daniel@example.com',
            bio: 'Daniel built the online shop and keeps the stock count honest.',
            order: 0,
        },
    },
    {
        file: 'sara-lindqvist.jpg',
        source: 'https://unsplash.com/photos/1544005313-94ddf0286df2',
        values: {
            name: 'Sara Lindqvist',
            role: 'Frontend engineer',
            department: 'engineering',
            email: 'sara@example.com',
            bio: 'Sara works on checkout, and on the wildflower beds behind the shop at weekends.',
            order: 1,
        },
    },
    {
        file: 'jonas-berg.jpg',
        source: 'https://unsplash.com/photos/1506794778202-cad84cf45f1d',
        values: {
            name: 'Jonas Berg',
            role: 'Backend engineer',
            department: 'engineering',
            order: 2,
        },
    },
    {
        file: 'marco-reyes.jpg',
        source: 'https://unsplash.com/photos/1507003211169-0a1dd7228f2d',
        values: {
            name: 'Marco Reyes',
            role: 'Head of sales',
            department: 'sales',
            email: 'marco@example.com',
            phone: '+47 22 41 08 12',
            bio: 'Marco looks after the offices we keep in plants, and visits each one before it signs up.',
            order: 0,
        },
    },
    {
        file: 'lucia-romero.jpg',
        source: 'https://unsplash.com/photos/1494790108377-be9c29b29330',
        values: {
            name: 'Lucía Romero',
            role: 'Account manager',
            department: 'sales',
            email: 'lucia@example.com',
            phone: '+47 22 41 08 14',
            order: 1,
        },
    },
    {
        file: 'martin-hale.jpg',
        source: 'https://unsplash.com/photos/1472099645785-5658abf4ff4e',
        values: {
            name: 'Martin Hale',
            role: 'Head of plant care',
            department: 'support',
            email: 'care@example.com',
            bio: 'Send Martin a photo of a struggling plant and he will tell you what it needs, usually less water.',
            order: 0,
        },
    },
    {
        file: 'felix-lund.jpg',
        source: 'https://unsplash.com/photos/1539571696357-5a69c17a67c6',
        values: {
            name: 'Felix Lund',
            role: 'Plant care advisor',
            department: 'support',
            order: 1,
        },
    },
];

const articleSeeds = [
    {
        cover: 'ferns.jpg',
        author: 'Felix Lund',
        values: {
            title: 'Bringing plants in for winter',
            slug: 'bringing-plants-in-for-winter',
            topic: 'guides',
            publishedOn: '2026-10-26',
            excerpt: 'Balcony plants want to come inside before the first frost. Check them for pests first.',
            body: 'Most balcony plants survive a cold night, but not a frost. Bring them in once the forecast drops below five degrees at night.\n\nLook under every leaf before a plant comes inside, and rinse it with the shower if you find anything. Then give it the brightest window you have, and water about half as often as you did in summer.',
        },
    },
    {
        cover: 'cherry-blossom.jpg',
        author: 'Marco Reyes',
        values: {
            title: 'Plant now for April',
            slug: 'plant-now-for-april',
            topic: 'news',
            publishedOn: '2026-10-19',
            excerpt: 'The autumn bulbs are in: tulips, daffodils and hyacinths, ready to go in the ground before it freezes.',
            body: 'Bulbs need a cold winter in the soil to flower in spring, so October and November are the months to plant them. This year we have twelve kinds of tulip, six daffodils and hyacinths in white, blue and pink.\n\nPlant each bulb twice as deep as it is tall, pointed end up. Buy twenty or more and we pack them with a planting guide.',
        },
    },
    {
        cover: 'office-corridor.jpg',
        author: 'Marco Reyes',
        values: {
            title: 'Plant care for offices',
            slug: 'plant-care-for-offices',
            topic: 'news',
            publishedOn: '2026-10-05',
            excerpt: 'We now choose, deliver and look after the plants in your office, with a visit every two weeks.',
            body: 'An office full of plants is easy to start and hard to keep. Our new office service does the keeping: we choose plants for your light, deliver them in pots that fit the room, and visit every two weeks to water, feed and turn them.\n\nAnything that does not thrive, we replace at no charge. Marco visits every office before it signs up, so write to him for a walk-through.',
        },
    },
    {
        cover: 'ferns.jpg',
        author: 'Ingrid Solberg',
        values: {
            title: 'Plants for a dark office',
            slug: 'plants-for-dark-offices',
            topic: 'guides',
            publishedOn: '2026-09-21',
            excerpt: 'Five plants that do well far from a window, and how often to water them.',
            body: 'Ferns, snake plants, pothos, ZZ plants and peace lilies all cope with little light. Water them when the top of the soil is dry, which in a heated office is about once a week.\n\nTurn the pots a quarter turn now and then, so they grow evenly instead of leaning toward the one window.',
        },
    },
    {
        cover: 'forest-path.jpg',
        author: 'Aiko Tanaka',
        values: {
            title: 'A morning at the nursery',
            slug: 'a-morning-at-the-nursery',
            topic: 'stories',
            publishedOn: '2026-09-07',
            excerpt: 'Where our ferns start out: a family nursery an hour north of town, at the edge of the forest.',
            body: "Most of our ferns come from one nursery, run by the same family for three generations. They grow them outdoors in the shade of the forest for their first year, which makes them tougher than greenhouse ferns.\n\nWe spent a morning there choosing this autumn's plants, and Aiko came back with the photos you see in the shop.",
        },
    },
    {
        cover: 'poppies.jpg',
        author: 'Sara Lindqvist',
        values: {
            title: 'Sowing wildflowers',
            slug: 'sowing-wildflowers',
            topic: 'guides',
            publishedOn: '2026-08-24',
            excerpt: 'Poppies, cornflowers and oxeye daisies from one packet, and why poor soil suits them best.',
            body: 'Wildflowers flower best in soil that has not been fed, so skip the compost. Clear the grass, rake the ground to a fine surface and scatter the seed in late summer or early spring.\n\nPress it down with a board, water once, and leave it alone. Poppies come first, in about ten weeks.',
        },
    },
    {
        cover: 'team-at-laptops.jpg',
        author: 'Martin Hale',
        values: {
            title: 'Ask us about your plants',
            slug: 'ask-us-about-your-plants',
            topic: 'stories',
            publishedOn: '2026-08-10',
            excerpt: 'What the plant care team answers most, and how a photo saves a plant.',
            body: 'The plant care team answers about forty questions a week. Half of them are the same question: why are the leaves turning yellow? The answer is usually too much water.\n\nA photo of the whole plant, the soil and the window it stands by tells us more than any description. Send one to care@example.com and we reply the same day.',
        },
    },
];

/**
 * Fills in what the demo database is missing: the photos, the header and
 * footer, the people, the articles, and every page. Content already there is
 * left alone, so an editor's changes survive a restart.
 */
export const seedContent = async (service: CmsService): Promise<void> => {
    const caller = service.caller({
        editor: {
            role: 'admin',
        },
    });

    const upload = async (file: string, alt: string): Promise<{ id: string; alt: string }> => {
        const bytes = new Uint8Array(await readFile(join(PHOTOS, file)));
        const record = await service.media.storeBytes(bytes, file, AUTHOR);
        if (record.alt === '') {
            await service.media.update(
                record.id,
                {
                    alt,
                },
                AUTHOR
            );
        }
        return {
            id: record.id,
            alt,
        };
    };

    // Next's cache lives in the running server, which has not started yet, so
    // publishing goes to the store without invalidating anything.
    const publish = async (ref: DocumentRef): Promise<void> => {
        const state = await service.draftState(ref);
        if (!state.complete) throw new Error(`The seed for ${formatRef(ref)} is missing ${state.missing.join(', ')}.`);
        await service.store.publish(state.target.kind, state.target.key, AUTHOR);
    };

    const fill = async (ref: DocumentRef, values: Record<string, unknown>): Promise<void> => {
        if ((await service.document(ref)).row !== undefined) return;
        await service.update({
            ref,
            changes: values,
            caller,
            author: AUTHOR,
            summary: 'Seeded',
        });
        await publish(ref);
        console.log(`[demo] seeded ${formatRef(ref)}`);
    };

    const photos = new Map<string, { id: string; alt: string }>();
    for (const photo of library) photos.set(photo.file, await upload(photo.file, photo.alt));

    await fill(
        {
            type: 'global',
            name: 'header',
        },
        {
            navItems: [
                {
                    label: 'Plant care',
                    href: '/blog?topic=guides',
                },
                {
                    label: 'Blog',
                    href: '/blog',
                },
                {
                    label: 'Team',
                    href: '/team',
                },
                {
                    label: 'Contact',
                    href: '/contact',
                },
            ],
            announcement: 'Order before 14:00 for next-day delivery in Oslo.',
        }
    );

    await fill(
        {
            type: 'global',
            name: 'footer',
        },
        {
            tagline: 'Houseplants, bulbs and seeds from growers we know, with help for as long as you keep them.',
            navItems: [
                {
                    label: 'Plant care guides',
                    href: '/blog?topic=guides',
                },
                {
                    label: 'News',
                    href: '/blog?topic=news',
                },
                {
                    label: 'Team',
                    href: '/team',
                },
                {
                    label: 'Contact',
                    href: '/contact',
                },
            ],
            contactEmail: 'hello@example.com',
            phone: '+47 22 41 08 00',
            address: 'Plantegata 4, 0550 Oslo',
            openingHours: 'Mon to Fri 10 to 18, Sat 10 to 16',
        }
    );

    if ((await service.editorItems('employees')).length === 0) {
        for (const person of people) {
            const photo = await upload(person.file, `Portrait of ${person.values.name}`);
            const created = await service.createItem(
                'employees',
                {
                    ...person.values,
                    photo,
                },
                caller,
                AUTHOR
            );
            await publish(created.target.ref);
        }
        console.log(`[demo] seeded ${people.length} employees`);
    }

    const staff = await service.editorItems('employees');
    const idOf = (name: string): string | undefined => staff.find((person) => person.label === name)?.id;

    if ((await service.editorItems('articles')).length === 0) {
        for (const article of articleSeeds) {
            const created = await service.createItem(
                'articles',
                {
                    ...article.values,
                    body: richTextFromPlain(article.values.body),
                    cover: photos.get(article.cover),
                    author: idOf(article.author),
                },
                caller,
                AUTHOR
            );
            await publish(created.target.ref);
        }
        console.log(`[demo] seeded ${articleSeeds.length} articles`);
    }

    await fill(
        {
            type: 'page',
            name: 'teamPage',
        },
        {
            heading: 'The people behind the shop',
            intro: 'Nine of us across design, engineering, sales and plant care, in the shop and online.',
            photo: photos.get('team-at-laptops.jpg'),
        }
    );

    await fill(
        {
            type: 'page',
            name: 'blogIndexPage',
        },
        {
            heading: 'Notes from the shop',
            intro: 'Plant care guides, news from the shop, and stories from the growers we buy from.',
        }
    );

    await fill(
        {
            type: 'page',
            name: 'contactPage',
        },
        {
            heading: 'Ask us anything about plants',
            intro: 'Questions about an order, a plant that is struggling, or plants for your office. We answer every weekday.',
            buttonLabel: 'Send message',
            thanks: 'Thanks. We will be in touch within a working day.',
            contacts: [idOf('Martin Hale'), idOf('Marco Reyes')].filter((id) => id !== undefined),
        }
    );

    await fill(
        {
            type: 'page',
            name: 'frontPage',
        },
        {
            hero: {
                impact: 'high',
                heading: 'Plants for every room',
                subheading: 'Houseplants, bulbs and seeds from growers we know, delivered across Oslo the next day.',
                image: photos.get('poppies.jpg'),
                links: [
                    {
                        label: 'Shop the season',
                        href: '/#shop',
                    },
                    {
                        label: 'Plant care guides',
                        href: '/blog?topic=guides',
                    },
                ],
            },
            intro: {
                columns: [
                    {
                        heading: 'Grown nearby',
                        body: richTextFromPlain(
                            'Most of what we sell comes from three nurseries within a day of the shop. We visit each of them every season and choose the plants ourselves.'
                        ),
                    },
                    {
                        heading: 'Help that lasts',
                        body: richTextFromPlain(
                            'Every plant comes with a care card. If it struggles anyway, send us a photo and the plant care team will tell you what it needs.'
                        ),
                    },
                    {
                        heading: 'Delivered in a day',
                        body: richTextFromPlain(
                            'Order before two and we deliver across Oslo the next day, wrapped in paper and packed so nothing breaks.'
                        ),
                    },
                ],
            },
            shop: {
                heading: 'In the shop this week',
                products: ['prod_fern', 'prod_snake_plant', 'prod_pothos', 'prod_tulips', 'prod_hyacinth', 'prod_seeds'],
            },
            media: {
                image: photos.get('forest-path.jpg'),
                caption: 'The forest edge at the nursery where our ferns spend their first year.',
            },
            latest: {
                heading: 'From the blog',
                articles: [],
            },
            callToAction: {
                heading: 'Plants for your office',
                body: 'We choose, deliver and look after the plants in your office, with a visit every two weeks.',
                links: [
                    {
                        label: 'Talk to Marco',
                        href: '/contact',
                    },
                    {
                        label: 'How it works',
                        href: '/blog/plant-care-for-offices',
                    },
                ],
            },
            seo: {
                title: 'Hagen, houseplants, bulbs and seeds in Oslo',
                description:
                    'Houseplants, bulbs and seeds from growers we know, delivered across Oslo the next day, with plant care help for as long as you keep them.',
            },
        }
    );
};
