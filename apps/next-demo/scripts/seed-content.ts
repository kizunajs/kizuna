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
            bio: 'Ingrid shapes how the shop looks and reads. She has run the design team since the first storefront.',
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
            bio: 'Aiko designs checkout and the account pages.',
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
            bio: 'Daniel looks after the API and everything that calls it.',
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
            bio: 'Marco talks to every new wholesale customer at least once.',
            order: 0,
        },
    },
    {
        file: 'lucia-romero.jpg',
        source: 'https://unsplash.com/photos/1494790108377-be9c29b29330',
        values: {
            name: 'Lucía Romero',
            role: 'Account executive',
            department: 'sales',
            email: 'lucia@example.com',
            order: 1,
        },
    },
    {
        file: 'martin-hale.jpg',
        source: 'https://unsplash.com/photos/1472099645785-5658abf4ff4e',
        values: {
            name: 'Martin Hale',
            role: 'Support lead',
            department: 'support',
            email: 'support@example.com',
            bio: 'Martin answers the hard questions, and writes the help pages so fewer people have to ask them.',
            order: 0,
        },
    },
    {
        file: 'felix-lund.jpg',
        source: 'https://unsplash.com/photos/1539571696357-5a69c17a67c6',
        values: {
            name: 'Felix Lund',
            role: 'Support engineer',
            department: 'support',
            order: 1,
        },
    },
];

const articleSeeds = [
    {
        cover: 'cherry-blossom.jpg',
        author: 'Marco Reyes',
        values: {
            title: 'Spring sale starts Monday',
            slug: 'spring-sale',
            topic: 'news',
            excerpt: 'Everything in the garden range is twenty percent off for one week.',
            body: 'From Monday morning until Sunday night, everything in the garden range is twenty percent off, in the shop and online.\n\nWholesale customers get the same discount on orders placed that week. Marco and Lucía are on hand if you want to plan a bigger order.',
        },
    },
    {
        cover: 'ferns.jpg',
        author: 'Ingrid Solberg',
        values: {
            title: 'Plants for a dark office',
            slug: 'plants-for-dark-offices',
            topic: 'guides',
            excerpt: 'Five plants that do well far from a window, and how often to water them.',
            body: 'Ferns, snake plants and pothos all cope with little light. Water them when the top of the soil is dry, which in a heated office is about once a week.\n\nTurn the pots a quarter turn now and then, so they grow evenly instead of leaning toward the one window.',
        },
    },
    {
        cover: 'forest-path.jpg',
        author: 'Martin Hale',
        values: {
            title: 'A day out with the support team',
            slug: 'support-team-day-out',
            topic: 'stories',
            excerpt: 'Why the support team closed the inbox for a day and went for a walk.',
            body: 'Once a year the support team takes a day away from the inbox. This year it was a long walk through the forest north of town.\n\nMost of the conversation was about the questions customers ask most, and which help pages would answer them before anyone has to write in.',
        },
    },
    {
        cover: 'office-corridor.jpg',
        author: 'Daniel Moreau',
        values: {
            title: 'New office, same people',
            slug: 'new-office',
            topic: 'news',
            excerpt: 'We moved two streets over. The address changed; the phone number did not.',
            body: 'The new office has room for the whole team on one floor, and a proper workshop for photographing products.\n\nVisitors are welcome as before. Ring the bell marked Kizuna on the ground floor.',
        },
    },
];

/**
 * Fills in what the demo database is missing: the photos, the people, the
 * articles, the home, blog and team pages, and the footer. Content already there is left alone,
 * so an editor's changes survive a restart.
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
            name: 'site',
        },
        {
            footerText: 'Kizuna demo shop. Content edited at /cms, or by an agent over MCP.',
            contactEmail: 'hello@example.com',
        }
    );

    await fill(
        {
            type: 'page',
            name: 'teamPage',
        },
        {
            heading: 'The people behind the shop',
            intro: 'Nine of us across design, engineering, sales and support.',
            photo: photos.get('team-at-laptops.jpg'),
        }
    );

    await fill(
        {
            type: 'page',
            name: 'blogIndexPage',
        },
        {
            heading: 'From the shop',
            intro: 'News, guides and the odd story from the people who run the shop.',
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

    if ((await service.editorItems('articles')).length === 0) {
        const staff = await service.editorItems('employees');
        for (const article of articleSeeds) {
            const created = await service.createItem(
                'articles',
                {
                    ...article.values,
                    body: richTextFromPlain(article.values.body),
                    cover: photos.get(article.cover),
                    author: staff.find((person) => person.label === article.author)?.id,
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
            name: 'frontPage',
        },
        {
            hero: {
                heading: 'Plants for every room',
                subheading: 'Bulbs, seeds and potted plants, picked by people who keep them alive.',
                image: photos.get('poppies.jpg'),
                cta: {
                    label: 'Read the blog',
                    href: 'https://example.com/blog',
                },
            },
            featured: ['prod_tulips', 'prod_hyacinth', 'prod_seeds'],
            articles: [],
            seo: {
                title: 'Kizuna demo shop',
                description: 'Bulbs, seeds and potted plants, with guides on keeping them alive.',
            },
        }
    );
};
